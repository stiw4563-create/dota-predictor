// GET /api/backtest?tournaments=ID,ID&full=1
//
// Walk-forward backtest + Platt calibration fit, persisted to KV.
//
// Modes:
//   default  — fast: hero-pool features approximated, calibrates Elo/form/H2H.
//   full=1   — accurate: fetches match details progressively to build a real
//              rolling hero-pool, so the draft factor is also calibrated.
//              Slower and uses more API calls (bounded by MAX_DETAILS).
//
// Fitted (A,B) are saved to KV so calibration survives cold starts.

import { NextRequest, NextResponse } from 'next/server';
import { od } from '@/lib/opendota';
import {
  runEloAcrossMatches,
  computeTeamStats,
  computeH2H,
  computeHeroSidePool,
} from '@/lib/aggregation';
import { buildRosters, clusterIdentities } from '@/lib/identity';
import { predict } from '@/lib/prediction';
import { fitPlatt, saveCalibration, type BacktestPoint } from '@/lib/calibration';
import { buildTournamentPool } from '@/lib/tier';
import type { ODLeagueMatch, ODMatchDetail } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_MATCHES_FAST = 120;
const MAX_MATCHES_FULL = 200;
const MAX_DETAILS_FULL = 400; // hard cap on /matches/{id} calls in full mode

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get('tournaments');
  const full = req.nextUrl.searchParams.get('full') === '1';

  let tournamentIds: number[];
  if (param && param !== 'auto') {
    tournamentIds = param
      .split(',')
      .map((s) => Number(s.trim()))
      .filter(Number.isFinite);
  } else {
    // Auto-discover (used by cron).
    const leagues = await od.leagues().catch(() => []);
    tournamentIds = buildTournamentPool(leagues, { count: 20 }).map((t) => t.id);
  }
  if (tournamentIds.length === 0) {
    return NextResponse.json({ error: 'no tournaments resolved' }, { status: 400 });
  }

  try {
    const lists = await Promise.all(
      tournamentIds.map((id) => od.leagueMatches(id).catch(() => []))
    );
    const allMatches: ODLeagueMatch[] = lists
      .flat()
      .filter((m) => m.radiant_team_id && m.dire_team_id)
      .sort((a, b) => a.start_time - b.start_time);

    if (allMatches.length < 30) {
      return NextResponse.json({ error: 'not enough matches', found: allMatches.length });
    }

    const tierMap = new Map<number, string>();
    const leagues = await od.leagues().catch(() => []);
    for (const l of leagues) tierMap.set(l.leagueid, l.tier ?? 'professional');

    const cap = full ? MAX_MATCHES_FULL : MAX_MATCHES_FAST;
    const step = Math.max(1, Math.floor(allMatches.length / cap));
    const sampled = allMatches.filter((_, i) => i % step === 0);

    // In FULL mode, pre-fetch details for a rolling window so the hero-pool can
    // be computed from real prior drafts. We fetch details for ALL matches up
    // to MAX_DETAILS_FULL (chronological), then for each target use the subset
    // strictly before it as the "pool".
    const detailCache = new Map<number, ODMatchDetail>();
    if (full) {
      const toFetch = allMatches.slice(0, MAX_DETAILS_FULL);
      const CONC = 6;
      for (let i = 0; i < toFetch.length; i += CONC) {
        const batch = toFetch.slice(i, i + CONC);
        const res = await Promise.all(
          batch.map((m) => od.match(m.match_id).catch(() => null))
        );
        res.forEach((d, k) => {
          if (d && d.picks_bans) detailCache.set(batch[k].match_id, d);
        });
      }
    }

    const points: BacktestPoint[] = [];
    const CONC = 5;
    for (let i = 0; i < sampled.length; i += CONC) {
      const batch = sampled.slice(i, i + CONC);
      const details = await Promise.all(
        batch.map((m) =>
          detailCache.get(m.match_id)
            ? Promise.resolve(detailCache.get(m.match_id)!)
            : od.match(m.match_id).catch(() => null)
        )
      );

      for (let j = 0; j < batch.length; j++) {
        const target = batch[j];
        const detail = details[j] as ODMatchDetail | null;
        if (!detail || !detail.picks_bans) continue;

        const history = allMatches.filter((m) => m.start_time < target.start_time);
        if (history.length < 10) continue;

        const clusters = clusterIdentities(buildRosters(history, []));
        const elo = runEloAcrossMatches(history, clusters);
        const teamAStats = computeTeamStats(target.radiant_team_id!, history, elo, clusters);
        const teamBStats = computeTeamStats(target.dire_team_id!, history, elo, clusters);
        const h2h = computeH2H(target.radiant_team_id!, target.dire_team_id!, history, clusters);

        // Hero pool: in FULL mode, use details of matches strictly before target.
        let poolDetails: ODMatchDetail[] = [];
        if (full) {
          poolDetails = [];
          for (const m of history) {
            const d = detailCache.get(m.match_id);
            if (d) poolDetails.push(d);
          }
        }
        // Always include the target's own draft is NOT allowed (leakage); use
        // only prior pool. If empty (fast mode), draft factor ≈ 0.
        const { heroStats, radiantWR } = computeHeroSidePool(poolDetails, tierMap);

        const radiantPicks = detail.picks_bans
          .filter((p) => p.is_pick && p.team === 0)
          .map((p) => p.hero_id);
        const direPicks = detail.picks_bans
          .filter((p) => p.is_pick && p.team === 1)
          .map((p) => p.hero_id);

        const pred = predict({
          teamA: teamAStats,
          teamB: teamBStats,
          sideA: 'radiant',
          heroesA: radiantPicks,
          heroesB: direPicks,
          heroPool: heroStats,
          poolRadiantWR: radiantWR || 0.5,
          poolMatches: poolDetails.length,
          h2h,
          players: new Map(),
          calibration: null,
        });

        points.push({ logit: pred.logit, outcome: target.radiant_win ? 1 : 0 });
      }
    }

    const params = fitPlatt(points);
    await saveCalibration(params);

    let rawCorrect = 0;
    for (const pt of points) {
      const rawPred = pt.logit >= 0 ? 1 : 0;
      if (rawPred === pt.outcome) rawCorrect++;
    }

    return NextResponse.json({
      ok: true,
      mode: full ? 'full' : 'fast',
      calibration: params,
      rawAccuracy: points.length ? rawCorrect / points.length : null,
      backtestedMatches: points.length,
      detailsFetched: detailCache.size,
      persisted: true,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

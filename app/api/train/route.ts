// GET /api/train         — train from accumulated KV dataset (preferred)
// GET /api/train?debug=1 — diagnostics about sample collection
// GET /api/train?live=1  — force live-fetch path (legacy, bypasses dataset)
//
// Preferred flow: /api/collect accumulates matches in KV daily; train reads
// that dataset (fast, no API calls) and fits the logistic model. Falls back to
// live fetching if the dataset is too small.

import { NextRequest, NextResponse } from 'next/server';
import { od } from '@/lib/opendota';
import { computeTeamStats, computeH2H, computeHeroSidePool } from '@/lib/aggregation';
import { buildRosters, clusterIdentities } from '@/lib/identity';
import { buildMatchupTable } from '@/lib/matchups';
import { extractFeatures } from '@/lib/features';
import { trainLogistic, evaluate, type TrainingSample } from '@/lib/train';
import { saveTrainedModel } from '@/lib/calibration';
import { getAllStoredMatches, type StoredMatch } from '@/lib/dataset';
import type { ODLeagueMatch, ODMatchDetail } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MIN_HISTORY = 8;
const MIN_DATASET = 80; // use stored dataset if at least this many matches

// Convert StoredMatch → the shapes our aggregation expects.
function toLeagueMatch(s: StoredMatch): ODLeagueMatch {
  return {
    match_id: s.id,
    start_time: s.t,
    duration: 0,
    radiant_team_id: s.rt,
    radiant_name: null,
    dire_team_id: s.dt,
    dire_name: null,
    leagueid: s.lg,
    league_name: '',
    series_id: s.sid ?? 0,
    series_type: s.st ?? 0,
    radiant_score: 0,
    dire_score: 0,
    radiant_win: s.rw,
  };
}
function toDetail(s: StoredMatch): ODMatchDetail {
  return {
    match_id: s.id,
    start_time: s.t,
    duration: 0,
    radiant_win: s.rw,
    radiant_team_id: s.rt,
    dire_team_id: s.dt,
    leagueid: s.lg,
    picks_bans: [
      ...s.rp.map((h, i) => ({ is_pick: true, hero_id: h, team: 0 as const, order: i })),
      ...s.dp.map((h, i) => ({ is_pick: true, hero_id: h, team: 1 as const, order: i })),
    ],
    players: [],
  };
}

export async function GET(req: NextRequest) {
  const debug = req.nextUrl.searchParams.get('debug') === '1';
  const diag: Record<string, unknown> = {};

  try {
    // ── Source data: prefer accumulated dataset ──
    let allMatches: ODLeagueMatch[] = [];
    const detailById = new Map<number, ODMatchDetail>();
    let source = 'dataset';

    const stored = await getAllStoredMatches();
    if (stored.length < MIN_DATASET) {
      return NextResponse.json({
        error: 'dataset too small — run /api/collect a few times first',
        datasetSize: stored.length,
        needed: MIN_DATASET,
      });
    }
    allMatches = stored.map(toLeagueMatch).sort((a, b) => a.start_time - b.start_time);
    for (const s of stored) detailById.set(s.id, toDetail(s));
    const storedById = new Map(stored.map((s) => [s.id, s]));
    diag.datasetSize = stored.length;
    diag.source = source;
    diag.totalMatches = allMatches.length;

    if (allMatches.length < 40) {
      return NextResponse.json({ error: 'not enough matches', diag });
    }

    const tierMap = new Map<number, string>();
    const leagues = await od.leagues().catch(() => []);
    for (const l of leagues) tierMap.set(l.leagueid, l.tier ?? 'professional');

    // Clusters + key once (identity stable).
    const allClusters = clusterIdentities(buildRosters(allMatches, []));
    const keyOf = (teamId: number | null): string | null => {
      if (!teamId) return null;
      const c = allClusters.get(teamId);
      return c ? `c${c.clusterId}` : `t${teamId}`;
    };
    const ELO_BASE = 1500;
    const ELO_K = 28;
    const eloExp = (ra: number, rb: number) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

    // Sorted details for rolling pool.
    const startTimeById = new Map<number, number>();
    for (const m of allMatches) startTimeById.set(m.match_id, m.start_time);
    const cachedSorted = [...detailById.entries()]
      .map(([mid, d]) => ({ t: startTimeById.get(mid) ?? 0, d }))
      .sort((a, b) => a.t - b.t);

    // Targets = matches with a draft + enough history.
    const targets = allMatches.filter(
      (m, i) => i >= MIN_HISTORY && detailById.has(m.match_id)
    );
    diag.targets = targets.length;

    const now = Math.floor(Date.now() / 1000);
    const samples: TrainingSample[] = [];

    for (const target of targets) {
      const detail = detailById.get(target.match_id)!;
      const history = allMatches.filter((m) => m.start_time < target.start_time);
      if (history.length < MIN_HISTORY) continue;

      const ratings = new Map<string, number>();
      for (const m of history) {
        const ka = keyOf(m.radiant_team_id);
        const kb = keyOf(m.dire_team_id);
        if (!ka || !kb) continue;
        const ra = ratings.get(ka) ?? ELO_BASE;
        const rb = ratings.get(kb) ?? ELO_BASE;
        const ea = eloExp(ra, rb);
        const sa = m.radiant_win ? 1 : 0;
        ratings.set(ka, ra + ELO_K * (sa - ea));
        ratings.set(kb, rb + ELO_K * (1 - sa - (1 - ea)));
      }

      const teamAStats = computeTeamStats(target.radiant_team_id!, history, ratings, allClusters);
      const teamBStats = computeTeamStats(target.dire_team_id!, history, ratings, allClusters);
      const h2h = computeH2H(target.radiant_team_id!, target.dire_team_id!, history, allClusters);

      // Average gold+xp advantage for each team from prior stored matches.
      const avgGx = (teamId: number): number => {
        let sum = 0;
        let n = 0;
        for (const s of storedById.values()) {
          if (s.t >= target.start_time || s.gx == null) continue;
          if (s.rt === teamId) { sum += s.gx; n++; }
          else if (s.dt === teamId) { sum -= s.gx; n++; } // flip sign for dire
        }
        return n > 0 ? sum / n : 0;
      };
      if (teamAStats) teamAStats.avgGoldXpAdv = avgGx(target.radiant_team_id!);
      if (teamBStats) teamBStats.avgGoldXpAdv = avgGx(target.dire_team_id!);

      const priorDetails: ODMatchDetail[] = [];
      for (const item of cachedSorted) {
        if (item.t < target.start_time) priorDetails.push(item.d);
        else break;
      }
      const { heroStats, radiantWR } = computeHeroSidePool(priorDetails, tierMap);
      const matchups = buildMatchupTable(priorDetails);

      const features = extractFeatures({
        teamA: teamAStats,
        teamB: teamBStats,
        sideA: 'radiant',
        heroesA: detail.picks_bans!.filter((p) => p.is_pick && p.team === 0).map((p) => p.hero_id),
        heroesB: detail.picks_bans!.filter((p) => p.is_pick && p.team === 1).map((p) => p.hero_id),
        heroPool: heroStats,
        poolRadiantWR: radiantWR || 0.5,
        h2h,
        players: new Map(),
        matchups,
      });

      samples.push({
        features,
        outcome: target.radiant_win ? 1 : 0,
        ageDays: Math.max(0, (now - target.start_time) / 86400),
      });
    }

    diag.samples = samples.length;
    if (debug) return NextResponse.json({ debug: true, diag });

    // Train/test split (chronological).
    const splitIdx = Math.floor(samples.length * 0.8);
    const trainSet = samples.slice(0, splitIdx);
    const testSet = samples.slice(splitIdx);

    const opts = { epochs: 800, lr: 0.1, l2: 0.05, halfLifeDays: 90 };
    const evalModel = trainLogistic(trainSet, opts);
    const heldOut = evalModel ? evaluate(evalModel, testSet) : null;
    const model = trainLogistic(samples, opts);

    if (!model) {
      return NextResponse.json({ error: 'training failed (need >=50)', samples: samples.length, diag });
    }
    // Attach honest out-of-sample metrics so the UI can show real confidence.
    if (heldOut) {
      model.heldOutAccuracy = heldOut.accuracy;
      model.heldOutLogLoss = heldOut.logLoss;
    }
    await saveTrainedModel(model);

    return NextResponse.json({
      ok: true,
      source,
      trainedOn: samples.length,
      inSample: { accuracy: model.accuracy, logLoss: model.logLoss, brier: model.brier },
      heldOut: heldOut
        ? { accuracy: heldOut.accuracy, logLoss: heldOut.logLoss, brier: heldOut.brier, testMatches: heldOut.n }
        : null,
      model: { weights: model.weights, bias: model.bias },
      persisted: true,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, diag }, { status: 502 });
  }
}

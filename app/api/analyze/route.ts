// POST /api/analyze — runs full analysis with identity-aware aggregation,
// player-on-hero stats, bans/draft order, and counter-pick winrates.

import { NextRequest, NextResponse } from 'next/server';
import { od } from '@/lib/opendota';
import {
  runEloAcrossMatches,
  computeTeamStats,
  computeH2H,
  computeHeroSidePool,
  computePlayerStats,
  counterPickWR,
} from '@/lib/aggregation';
import { buildRosters, clusterIdentities } from '@/lib/identity';
import { getTeamRosterData, bestHeroFit, type TeamRosterData } from '@/lib/roster';
import { h2hBySeries } from '@/lib/series';
import { buildMatchupTable } from '@/lib/matchups';
import { loadCalibration, loadTrainedModel } from '@/lib/calibration';
import { predict } from '@/lib/prediction';
import type { ODMatchDetail, AnalyzeResponse, Side } from '@/lib/types';

interface Body {
  tournamentIds: number[];
  teamAId: number;
  teamBId: number;
  sideA: Side;
  heroesA: number[];
  heroesB: number[];
}

const MAX_DETAILS_PER_LEAGUE = 25;
const MAX_TOTAL_DETAILS = 80;

export async function POST(req: NextRequest) {
  const warnings: string[] = [];
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const { tournamentIds, teamAId, teamBId, sideA, heroesA, heroesB } = body;
  if (!Array.isArray(tournamentIds) || tournamentIds.length === 0) {
    return NextResponse.json({ error: 'tournamentIds required' }, { status: 400 });
  }

  try {
    // Tier map
    const allLeagues = await od.leagues();
    const tierMap = new Map<number, string>();
    for (const l of allLeagues) tierMap.set(l.leagueid, l.tier ?? 'professional');

    // All league matches (parallel)
    const matchesByLeague = await Promise.all(
      tournamentIds.map(async (id) => {
        try {
          return await od.leagueMatches(id);
        } catch (e) {
          warnings.push(`Tournament ${id}: ${(e as Error).message}`);
          return [];
        }
      })
    );
    const allMatches = matchesByLeague.flat();
    if (allMatches.length === 0) {
      return NextResponse.json({ error: 'no matches in pool' }, { status: 404 });
    }

    // Sample most-recent details per league
    const detailIds: number[] = [];
    for (const list of matchesByLeague) {
      const recent = [...list]
        .sort((a, b) => b.start_time - a.start_time)
        .slice(0, MAX_DETAILS_PER_LEAGUE);
      for (const m of recent) detailIds.push(m.match_id);
    }
    const capped = detailIds.slice(0, MAX_TOTAL_DETAILS);
    const detailResults = await Promise.allSettled(capped.map((id) => od.match(id)));
    const details: ODMatchDetail[] = [];
    for (const r of detailResults) {
      if (r.status === 'fulfilled' && r.value && r.value.picks_bans) {
        details.push(r.value);
      }
    }
    if (details.length < capped.length) {
      warnings.push(`Hero/player stats from ${details.length}/${capped.length} matches.`);
    }

    // ─── Identity clustering ───
    const rosters = buildRosters(allMatches, details);
    const clusters = clusterIdentities(rosters);

    // ─── Elo / team stats / H2H — all identity-aware ───
    const elo = runEloAcrossMatches(allMatches, clusters);
    const teamAStats = computeTeamStats(teamAId, allMatches, elo, clusters);
    const teamBStats = computeTeamStats(teamBId, allMatches, elo, clusters);
    const h2h = computeH2H(teamAId, teamBId, allMatches, clusters);

    // ─── Hero pool with bans & pick priority ───
    const { heroStats, radiantWR } = computeHeroSidePool(details, tierMap);

    // ─── Players (from in-pool details, sparse) ───
    const matchIndex = new Map(allMatches.map((m) => [m.match_id, m]));
    const players = computePlayerStats(details, matchIndex);

    // ─── Real roster + player-on-hero from direct API (dense) ───
    // Only fetch when a draft is present (otherwise heroFit isn't used).
    const draftPresent =
      heroesA.filter(Boolean).length > 0 || heroesB.filter(Boolean).length > 0;
    let rosterA: TeamRosterData | null = null;
    let rosterB: TeamRosterData | null = null;
    if (draftPresent) {
      [rosterA, rosterB] = await Promise.all([
        getTeamRosterData(teamAId).catch(() => null),
        getTeamRosterData(teamBId).catch(() => null),
      ]);
    }

    // ─── Series-adjusted H2H ───
    const seriesH2H = h2hBySeries(teamAId, teamBId, allMatches);

    // ─── Hero matchup table from pool details ───
    const matchups = buildMatchupTable(details);

    // ─── Load persisted calibration + trained model (KV-backed) ───
    const [calibration, trainedModel] = await Promise.all([
      loadCalibration(),
      loadTrainedModel(),
    ]);

    // ─── Prediction ───
    const prediction = predict({
      teamA: teamAStats,
      teamB: teamBStats,
      sideA,
      heroesA: heroesA.filter(Boolean),
      heroesB: heroesB.filter(Boolean),
      heroPool: heroStats,
      poolRadiantWR: radiantWR,
      poolMatches: details.length,
      h2h,
      players,
      rosterA,
      rosterB,
      seriesH2H,
      matchups,
      calibration,
      trainedModel,
    });

    if (!teamAStats) warnings.push('Команда A не найдена в выбранных турнирах.');
    if (!teamBStats) warnings.push('Команда B не найдена в выбранных турнирах.');

    // ─── Derived UI data ───

    // Top heroes per side (min 4 games)
    const allHeroes = Object.values(heroStats);
    const topHeroesRadiant = allHeroes
      .filter((h) => h.radiantGames >= 4)
      .sort((a, b) => b.radiantWR - a.radiantWR)
      .slice(0, 8)
      .map((h) => ({ heroId: h.heroId, winrate: h.radiantWR, games: Math.round(h.radiantGames) }));
    const topHeroesDire = allHeroes
      .filter((h) => h.direGames >= 4)
      .sort((a, b) => b.direWR - a.direWR)
      .slice(0, 8)
      .map((h) => ({ heroId: h.heroId, winrate: h.direWR, games: Math.round(h.direGames) }));

    // Most-banned
    const mostBanned = allHeroes
      .filter((h) => h.bans > 0)
      .sort((a, b) => b.bans - a.bans)
      .slice(0, 8)
      .map((h) => ({ heroId: h.heroId, bans: Math.round(h.bans) }));

    // Player-hero fit slot-by-slot for both teams
    const fitRows = (team: typeof teamAStats, heroes: number[]) => {
      if (!team) return [];
      const core = team.coreRoster;
      const rows: AnalyzeResponse['playerHeroFitA'] = [];
      for (const h of heroes) {
        if (!h) continue;
        for (const pid of core) {
          const ps = players.get(pid);
          const hd = ps?.heroes[h];
          if (!ps || !hd) continue;
          rows.push({
            accountId: pid,
            heroId: h,
            winrate: hd.winrate,
            games: hd.games,
            name: ps.name,
          });
        }
      }
      // Top 6 by sample size, then winrate
      return rows.sort((a, b) => b.games - a.games || b.winrate - a.winrate).slice(0, 6);
    };
    const playerHeroFitA = fitRows(teamAStats, heroesA.filter(Boolean));
    const playerHeroFitB = fitRows(teamBStats, heroesB.filter(Boolean));

    // Counter-picks: how each of A's heroes does vs B's draft and vice-versa.
    const cpHelp = (own: number[], enemy: number[]) =>
      own
        .filter(Boolean)
        .map((h) => {
          const { winrate, sample } = counterPickWR(h, enemy.filter(Boolean), details);
          return { heroId: h, winrateAgainst: winrate, sampleSize: sample };
        });
    const counterPicksForA = cpHelp(heroesA, heroesB);
    const counterPicksForB = cpHelp(heroesB, heroesA);

    const resp: AnalyzeResponse = {
      teamAStats,
      teamBStats,
      h2h,
      heroSidePool: heroStats,
      poolRadiantWR: radiantWR,
      poolGameCount: details.length,
      prediction,
      warnings,
      topHeroesRadiant,
      topHeroesDire,
      mostBanned,
      playerHeroFitA,
      playerHeroFitB,
      counterPicksForA,
      counterPicksForB,
      seriesH2H,
    };
    return NextResponse.json(resp);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

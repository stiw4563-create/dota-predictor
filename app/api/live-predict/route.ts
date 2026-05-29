// GET /api/live-predict  — honest in-game predictions for pool tournaments.
//
// Filters to games we can identify (real team_ids resolvable to names) in the
// current tournament pool. Distinguishes three phases:
//   - draft:   game_time <= 0 (heroes being picked, match not started)
//   - live:    game in progress
//   - (stale finished games are dropped — see isLikelyFinished)

import { NextRequest, NextResponse } from 'next/server';
import { od } from '@/lib/opendota';
import { buildTournamentPool } from '@/lib/tier';
import { predictLive } from '@/lib/livemodel';

export const dynamic = 'force-dynamic';
export const revalidate = 15;

export async function GET(req: NextRequest) {
  const matchFilter = req.nextUrl.searchParams.get('match');
  const allLeagues = req.nextUrl.searchParams.get('all') === '1';
  try {
    const [games, leagues, teams] = await Promise.all([
      od.live(),
      od.leagues().catch(() => []),
      od.teams().catch(() => [] as Array<{ team_id: number; name: string }>),
    ]);

    const leagueName = new Map<number, string>();
    for (const l of leagues) leagueName.set(l.leagueid, l.name);
    const poolIds = new Set(
      buildTournamentPool(leagues, { count: 30 }).map((t) => t.id)
    );
    const teamName = new Map<number, string>();
    for (const t of teams) if (t.team_id && t.name) teamName.set(t.team_id, t.name);

    // Tournament games in our pool (or all with ?all=1).
    let pool = games.filter((g) => (g.league_id ?? 0) > 0);
    if (!allLeagues) pool = pool.filter((g) => poolIds.has(g.league_id!));

    const filtered = matchFilter
      ? pool.filter((g) => String(g.match_id) === matchFilter)
      : pool;

    // Resolve names via match detail; only keep games we can actually identify.
    const resolved = await Promise.all(
      filtered.slice(0, 16).map(async (g) => {
        let rName = g.radiant_team?.team_name || null;
        let dName = g.dire_team?.team_name || null;
        let rId: number | undefined;
        let dId: number | undefined;
        try {
          const d = await od.match(Number(g.match_id));
          rId = d.radiant_team_id;
          dId = d.dire_team_id;
          if (rId && teamName.has(rId)) rName = teamName.get(rId)!;
          if (dId && teamName.has(dId)) dName = teamName.get(dId)!;
        } catch {
          /* detail not ready */
        }
        return { g, rName, dName, rId, dId };
      })
    );

    const now = Math.floor(Date.now() / 1000);
    const out = [];
    for (const { g, rName, dName } of resolved) {
      // Require BOTH team names — drops unidentifiable / stale lobbies.
      if (!rName || !dName) continue;

      const gt = g.game_time ?? 0;
      const rnw = g.scoreboard?.radiant?.net_worth;
      const dnw = g.scoreboard?.dire?.net_worth;
      const netLead = rnw != null && dnw != null ? rnw - dnw : (g.radiant_lead ?? 0);
      const rScore = g.radiant_score ?? g.scoreboard?.radiant?.score ?? 0;
      const dScore = g.dire_score ?? g.scoreboard?.dire?.score ?? 0;

      // Draft phase: no game clock yet (heroes being picked).
      if (gt <= 0) {
        out.push({
          matchId: g.match_id,
          leagueId: g.league_id,
          leagueName: g.league_id ? leagueName.get(g.league_id) ?? null : null,
          radiantTeam: rName,
          direTeam: dName,
          radiantScore: 0,
          direScore: 0,
          gameTimeSec: 0,
          phase: 'draft' as const,
          prediction: null,
        });
        continue;
      }

      // Drop games that look already decided/stale. /live keeps finished games
      // around with their final state, so a very large net-worth lead is the
      // strongest signal a game is effectively over. OR conditions:
      //  - net lead ≥ 30k after 25min  → almost always game over
      //  - net lead ≥ 22k AND score diff ≥ 15  → decided
      //  - past 35min with lead ≥ 18k  → late & decided
      const lead = Math.abs(netLead);
      const scoreDiff = Math.abs(rScore - dScore);
      const min = gt / 60;
      const stale =
        (min > 25 && lead >= 30000) ||
        (lead >= 22000 && scoreDiff >= 15) ||
        (min > 35 && lead >= 18000);
      if (stale) continue;

      const pred = predictLive({
        radiantGoldAdv: netLead,
        radiantXpAdv: 0,
        gameTimeSec: gt,
        radiantScore: rScore,
        direScore: dScore,
      });

      out.push({
        matchId: g.match_id,
        leagueId: g.league_id,
        leagueName: g.league_id ? leagueName.get(g.league_id) ?? null : null,
        radiantTeam: rName,
        direTeam: dName,
        radiantScore: rScore,
        direScore: dScore,
        gameTimeSec: gt,
        phase: 'live' as const,
        prediction: pred,
      });
    }

    // Draft games first (most "current"), then live by decisiveness.
    out.sort((a, b) => {
      if (a.phase !== b.phase) return a.phase === 'draft' ? -1 : 1;
      if (a.phase === 'live' && b.phase === 'live' && a.prediction && b.prediction) {
        return (
          Math.abs(b.prediction.probRadiant - 0.5) -
          Math.abs(a.prediction.probRadiant - 0.5)
        );
      }
      return 0;
    });

    return NextResponse.json({
      count: out.length,
      matches: out,
      _debug: {
        totalLiveGames: games.length,
        tournamentGames: games.filter((g) => (g.league_id ?? 0) > 0).length,
        identified: out.length,
        sampleRaw: games
          .filter((g) => (g.league_id ?? 0) > 0)
          .slice(0, 3)
          .map((g) => ({
            match_id: g.match_id,
            game_time: g.game_time,
            radiant_lead: g.radiant_lead,
            radiant_score: g.radiant_score,
            dire_score: g.dire_score,
            keys: Object.keys(g),
          })),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

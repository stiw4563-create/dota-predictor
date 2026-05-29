import { NextRequest, NextResponse } from 'next/server';
import { od } from '@/lib/opendota';
import type { LiveMatchSummary } from '@/lib/types';

export const revalidate = 15;

export async function GET(req: NextRequest) {
  try {
    const leagueId = req.nextUrl.searchParams.get('leagueId');
    const filter = leagueId ? Number(leagueId) : null;
    const live = await od.live();

    const result: LiveMatchSummary[] = live
      .filter((g) => (filter ? g.league_id === filter : true))
      .map((g) => ({
        matchId: Number(g.match_id ?? 0),
        leagueId: g.league_id ?? 0,
        radiantTeamId: g.radiant_team?.team_id ?? null,
        radiantName: g.radiant_team?.team_name ?? 'Radiant',
        direTeamId: g.dire_team?.team_id ?? null,
        direName: g.dire_team?.team_name ?? 'Dire',
        radiantPicks:
          g.scoreboard?.radiant?.picks?.map((p) => p.hero_id) ?? [],
        direPicks: g.scoreboard?.dire?.picks?.map((p) => p.hero_id) ?? [],
        gameTime: g.game_time ?? 0,
        radiantScore: g.radiant_score ?? 0,
        direScore: g.dire_score ?? 0,
      }))
      .filter((m) => m.matchId > 0);

    return NextResponse.json({ live: result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

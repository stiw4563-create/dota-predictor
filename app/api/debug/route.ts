// GET /api/debug?league=ID - inspect a specific league's matches.
// GET /api/debug - find recent named tournaments and probe them.

import { NextRequest, NextResponse } from 'next/server';
import { od } from '@/lib/opendota';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Liquipedia gave us these real, current tournament names. Let's find their
// OpenDota leagueids by name match, then check if their matches have team data.
const CURRENT_NAMES = [
  'BLAST Slam',
  'PGL Wallachia',
  'The International 2026',
  'ESL One',
  'DreamLeague',
  'FISSURE',
  'Riyadh Masters',
];

export async function GET(req: NextRequest) {
  const leagueParam = req.nextUrl.searchParams.get('league');

  // Mode 1: inspect a specific league
  if (leagueParam) {
    const id = Number(leagueParam);
    try {
      const matches = await od.leagueMatches(id);
      const sorted = [...matches].sort((a, b) => (b.start_time ?? 0) - (a.start_time ?? 0));
      return NextResponse.json({
        leagueId: id,
        matchCount: matches.length,
        sample: sorted.slice(0, 10).map((m) => ({
          matchId: m.match_id,
          start: m.start_time ? new Date(m.start_time * 1000).toISOString() : null,
          radiantName: m.radiant_name,
          direName: m.dire_name,
          radiantTeamId: m.radiant_team_id,
          direTeamId: m.dire_team_id,
          radiantWin: m.radiant_win,
        })),
      });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  }

  // Mode 2: find current tournaments by name in OpenDota
  try {
    const leagues = await od.leagues();
    const matched: Record<string, unknown[]> = {};
    for (const target of CURRENT_NAMES) {
      const hits = leagues
        .filter((l) => l.name?.toLowerCase().includes(target.toLowerCase()))
        .sort((a, b) => b.leagueid - a.leagueid)
        .slice(0, 5)
        .map((l) => ({ id: l.leagueid, name: l.name, tier: l.tier }));
      matched[target] = hits;
    }
    return NextResponse.json({
      hint: 'Add ?league=ID to inspect matches of a specific league',
      matchedByName: matched,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

// Note: KV status is exposed via /api/backtest response (persisted flag) and
// the kvIsPersistent() helper. To check env wiring quickly, see which KV vars
// are present without leaking secrets.

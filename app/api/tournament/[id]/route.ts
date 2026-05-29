// GET /api/tournament/[id]
// Returns matches + distinct teams for a league. Resolves team names via the
// bulk /teams endpoint because /leagues/{id}/matches omits team names.

import { NextRequest, NextResponse } from 'next/server';
import { od } from '@/lib/opendota';
import type { MatchSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'bad id' }, { status: 400 });
    }

    const [raw, allTeams] = await Promise.all([
      od.leagueMatches(id),
      od.teams().catch(() => [] as Array<{ team_id: number; name: string; tag: string }>),
    ]);

    // team_id → name lookup
    const nameById = new Map<number, string>();
    for (const t of allTeams) {
      if (t.team_id && t.name) nameById.set(t.team_id, t.name);
    }
    const resolve = (teamId: number | null, fallbackName: string | null): string => {
      if (teamId && nameById.has(teamId)) return nameById.get(teamId)!;
      if (fallbackName && fallbackName !== 'TBD') return fallbackName;
      if (teamId) return `Team ${teamId}`;
      return 'TBD';
    };

    // Real played matches: both teams identified by id.
    const real = raw.filter((m) => m.radiant_team_id && m.dire_team_id);

    const matches: MatchSummary[] = real
      .sort((a, b) => b.start_time - a.start_time)
      .map((m) => ({
        matchId: m.match_id,
        startTime: m.start_time,
        duration: m.duration,
        radiantTeamId: m.radiant_team_id,
        radiantName: resolve(m.radiant_team_id, m.radiant_name),
        direTeamId: m.dire_team_id,
        direName: resolve(m.dire_team_id, m.dire_name),
        radiantWin: m.radiant_win,
        leagueId: m.leagueid,
        leagueName: m.league_name,
      }));

    // Distinct teams
    const teamMap = new Map<number, string>();
    for (const m of real) {
      if (m.radiant_team_id) teamMap.set(m.radiant_team_id, resolve(m.radiant_team_id, m.radiant_name));
      if (m.dire_team_id) teamMap.set(m.dire_team_id, resolve(m.dire_team_id, m.dire_name));
    }
    const teams = [...teamMap.entries()]
      .map(([tid, name]) => ({ id: tid, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ matches, teams });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

// GET /api/match/[id]
// Returns the draft (picks per side) + team ids for a single match, so the UI
// can auto-fill the hero pickers when a user clicks a played match.

import { NextRequest, NextResponse } from 'next/server';
import { od } from '@/lib/opendota';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 });
  }
  try {
    const m = await od.match(id);
    const picks = m.picks_bans?.filter((p) => p.is_pick) ?? [];
    const radiantHeroes = picks
      .filter((p) => p.team === 0)
      .sort((a, b) => a.order - b.order)
      .map((p) => p.hero_id);
    const direHeroes = picks
      .filter((p) => p.team === 1)
      .sort((a, b) => a.order - b.order)
      .map((p) => p.hero_id);

    return NextResponse.json({
      matchId: m.match_id,
      radiantTeamId: m.radiant_team_id ?? null,
      direTeamId: m.dire_team_id ?? null,
      radiantWin: m.radiant_win,
      radiantHeroes,
      direHeroes,
      hasDraft: picks.length > 0,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

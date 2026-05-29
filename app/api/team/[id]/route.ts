// GET /api/team/[id]
// Returns enriched team info: name, tag, region, current roster.
// OpenDota gives name + tag; Liquipedia gives the roster.
// We try to match Liquipedia page by team name (best-effort).

import { NextRequest, NextResponse } from 'next/server';
import { od } from '@/lib/opendota';
import { getTeam } from '@/lib/liquipedia';

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
    const team = await od.team(id);
    const name = team.name || `Team ${id}`;
    const tag = team.tag;
    // Try Liquipedia (best-effort, returns null if unavailable)
    let lp = null;
    try {
      lp = await getTeam(name.replace(/ /g, '_'));
    } catch {
      lp = null;
    }
    return NextResponse.json({
      id,
      name,
      tag,
      region: lp?.region ?? null,
      roster: lp?.roster ?? [],
      liquipediaPage: lp?.liquipediaPage ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

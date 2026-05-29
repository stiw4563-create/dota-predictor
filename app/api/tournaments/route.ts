// GET /api/tournaments
//
// Discovery from production diagnostics:
//   - /leagues gives name + tier but NO last_match_time and is unordered
//     (leagueid is NOT chronological - id 65019 is an ancient 2012 event).
//   - /leagues/{id}/matches gives real matches with team_id + start_time,
//     but does NOT include team names (radiant_name/dire_name are null).
//   - Team names must be resolved separately via /teams (bulk).
//
// Strategy:
//   1. Filter leagues to premium/professional tier-1 named events.
//   2. Probe a batch via /leagues/{id}/matches, ranking by most recent real
//      match (matches with two team_ids). This is the only reliable recency.
//   3. Keep the 5 freshest. Team-name resolution happens in /tournament/[id].

import { NextResponse } from 'next/server';
import { od } from '@/lib/opendota';
import { buildTournamentPool } from '@/lib/tier';
import type { Tournament } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 600;
export const maxDuration = 60;

export async function GET() {
  try {
    const leagues = await od.leagues();
    // Candidate pool of plausible tier-1 events (premium+professional, no quals).
    const pool = buildTournamentPool(leagues, { count: 60 });

    const now = Math.floor(Date.now() / 1000);
    const probed: Array<Tournament & { matchCount: number }> = [];
    const CONCURRENCY = 6;

    for (let i = 0; i < pool.length; i += CONCURRENCY) {
      const batch = pool.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (t) => {
          try {
            const matches = await od.leagueMatches(t.id);
            // "Real" match = both teams present (by id). Names come later.
            const real = matches.filter(
              (m) => m.radiant_team_id && m.dire_team_id
            );
            if (real.length === 0) return null;
            const lastTime = real.reduce(
              (mx, x) => Math.max(mx, x.start_time ?? 0),
              0
            );
            // Skip events whose newest match is older than ~1 year (stale).
            if (now - lastTime > 365 * 86400) return null;
            const status: 'live' | 'recent' =
              now - lastTime < 36 * 60 * 60 ? 'live' : 'recent';
            return {
              ...t,
              matchCount: real.length,
              status,
              lastMatchTime: lastTime,
            };
          } catch {
            return null;
          }
        })
      );
      for (const r of results) if (r) probed.push(r);
      // Stop once we have a healthy set of fresh tournaments.
      if (probed.length >= 12) break;
    }

    const tournaments = probed
      .sort((a, b) => (b.lastMatchTime ?? 0) - (a.lastMatchTime ?? 0))
      .slice(0, 5);

    return NextResponse.json({
      tournaments,
      _debug: {
        poolSize: pool.length,
        probedFresh: probed.length,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

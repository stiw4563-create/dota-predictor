// Tournament selection, v0.7.
//
// KEY INSIGHT from production diagnostics:
//   Real current Tier-1 tournaments (DreamLeague S29, PGL Wallachia 2026,
//   BLAST Slam VII, ESL One Birmingham 2026) all have tier="professional"
//   in OpenDota, NOT "premium". The "premium" tier mostly contains The
//   International + a lot of old/junk leagues. And last_match_time is never
//   populated by /leagues.
//
// New strategy:
//   - Consider BOTH premium and professional tiers.
//   - Exclude qualifiers, open quals, division 2 (lower-tier sub-events).
//   - Sort by leagueid descending (newer Valve IDs = more recent events).
//   - The /api/tournaments route then verifies each has real (non-TBD) matches
//     and keeps the freshest 5.

import type { ODLeague, Tournament } from './types';

// Sub-events and junk we don't want in a "Tier-1 pool".
const EXCLUDE_RE =
  /qualifier|closed qual|open qual|division 2|div 2|tutorial|test|amateur|cyber school|low priority|^league \d+$|^adsf|season #\d+ \w+ closed/i;

// Names that signal a genuine Tier-1 main event.
const TIER1_HINT_RE =
  /international|dreamleague|wallachia|blast slam|esl one|riyadh|fissure|major|champions|elite league|betboom|pgl|epl|games of the future/i;

export function buildTournamentPool(
  leagues: ODLeague[],
  opts: { count?: number } = {}
): Tournament[] {
  const count = opts.count ?? 5;

  const eligible = leagues
    .filter((l) => l.tier === 'premium' || l.tier === 'professional')
    .filter((l) => !!l.name && l.name.length >= 3)
    .filter((l) => !EXCLUDE_RE.test(l.name));

  // Prefer leagues whose names look like real Tier-1 main events, sorted by
  // recency (leagueid). Then everything else as backfill.
  const tier1 = eligible
    .filter((l) => TIER1_HINT_RE.test(l.name))
    .sort((a, b) => b.leagueid - a.leagueid);
  const rest = eligible
    .filter((l) => !TIER1_HINT_RE.test(l.name))
    .sort((a, b) => b.leagueid - a.leagueid);

  const ordered = [...tier1, ...rest];

  return ordered.map((l) => ({
    id: l.leagueid,
    name: l.name,
    tier: l.tier ?? 'unknown',
    lastMatchTime: l.last_match_time ?? null,
    status: 'recent' as const,
    matchCount: 0,
  }));
}

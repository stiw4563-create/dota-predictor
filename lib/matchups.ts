// Hero matchup table, v2.0.
//
// Builds a hero-vs-hero winrate table from match drafts: for each pair of heroes
// on opposing sides, how often did hero A's side win? This powers the
// deltaMatchup feature (counter-pick advantage).
//
// matchups: Map<heroA, Map<heroB, {wins, games}>>  (wr from heroA's perspective)

import type { ODMatchDetail } from './types';

export type MatchupTable = Map<number, Map<number, { wr: number; games: number }>>;

export function buildMatchupTable(details: ODMatchDetail[]): MatchupTable {
  // raw counts: heroA → heroB → [wins, games]
  const raw = new Map<number, Map<number, { wins: number; games: number }>>();

  const bump = (a: number, b: number, aWon: boolean) => {
    let row = raw.get(a);
    if (!row) {
      row = new Map();
      raw.set(a, row);
    }
    let cell = row.get(b);
    if (!cell) {
      cell = { wins: 0, games: 0 };
      row.set(b, cell);
    }
    cell.games++;
    if (aWon) cell.wins++;
  };

  for (const d of details) {
    if (!d.picks_bans) continue;
    const radiant = d.picks_bans.filter((p) => p.is_pick && p.team === 0).map((p) => p.hero_id);
    const dire = d.picks_bans.filter((p) => p.is_pick && p.team === 1).map((p) => p.hero_id);
    const radiantWon = d.radiant_win;
    // Every radiant hero vs every dire hero
    for (const r of radiant) {
      for (const di of dire) {
        bump(r, di, radiantWon); // r's perspective
        bump(di, r, !radiantWon); // di's perspective
      }
    }
  }

  // finalize winrates
  const out: MatchupTable = new Map();
  for (const [a, row] of raw) {
    const orow = new Map<number, { wr: number; games: number }>();
    for (const [b, cell] of row) {
      orow.set(b, { wr: cell.games > 0 ? cell.wins / cell.games : 0.5, games: cell.games });
    }
    out.set(a, orow);
  }
  return out;
}

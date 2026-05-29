// Series awareness, v1.0.
//
// Pro matches are played in series (BO1/BO3/BO5). OpenDota tags each match with
// series_id and series_type:
//   series_type: 0 = BO1, 1 = BO3, 2 = BO5
//
// Why it matters for prediction:
//   1. Within a series, earlier games inform later ones — a team that won
//      game 1 has shown a working strategy/draft. When predicting game N of an
//      ongoing series, games 1..N-1 of THAT series should weigh more.
//   2. Series context lets us group games so head-to-head isn't double-counted
//      (5 games in one BO5 shouldn't count as 5 independent H2H meetings).
//
// We expose:
//   - groupBySeries: cluster a match list into series
//   - seriesWeight: extra multiplier for games in the same series as the target
//   - h2hSeriesAdjusted: H2H counted by series outcome, not raw game count

import type { ODLeagueMatch } from './types';

export interface Series {
  seriesId: number;
  type: number; // 0 BO1, 1 BO3, 2 BO5
  matches: ODLeagueMatch[];
  teamAId: number | null;
  teamBId: number | null;
  // winner by games won
  winsA: number;
  winsB: number;
}

export function groupBySeries(matches: ODLeagueMatch[]): Map<number, Series> {
  const out = new Map<number, Series>();
  for (const m of matches) {
    // series_id 0 means "not part of a tracked series" - treat each as its own.
    const sid = m.series_id && m.series_id > 0 ? m.series_id : -m.match_id;
    let s = out.get(sid);
    if (!s) {
      s = {
        seriesId: sid,
        type: m.series_type ?? 0,
        matches: [],
        teamAId: m.radiant_team_id,
        teamBId: m.dire_team_id,
        winsA: 0,
        winsB: 0,
      };
      out.set(sid, s);
    }
    s.matches.push(m);
    // Tally by the series' canonical teamA/teamB (sides swap between games).
    const aIsRadiant = m.radiant_team_id === s.teamAId;
    const aWon = (m.radiant_win && aIsRadiant) || (!m.radiant_win && !aIsRadiant);
    if (aWon) s.winsA++;
    else s.winsB++;
  }
  return out;
}

// Series-adjusted H2H: count SERIES wins, not individual game wins. A 2-1 BO3
// counts as one series win for the victor, which better reflects "who beats whom".
export function h2hBySeries(
  teamA: number,
  teamB: number,
  matches: ODLeagueMatch[]
): { seriesPlayed: number; seriesWinsA: number; seriesWinsB: number; gamesA: number; gamesB: number } {
  const relevant = matches.filter(
    (m) =>
      (m.radiant_team_id === teamA && m.dire_team_id === teamB) ||
      (m.radiant_team_id === teamB && m.dire_team_id === teamA)
  );
  const series = groupBySeries(relevant);
  let seriesWinsA = 0;
  let seriesWinsB = 0;
  let gamesA = 0;
  let gamesB = 0;
  for (const s of series.values()) {
    // Normalize each series so A = our teamA param
    for (const m of s.matches) {
      const aIsRadiant = m.radiant_team_id === teamA;
      const aWon = (m.radiant_win && aIsRadiant) || (!m.radiant_win && !aIsRadiant);
      if (aWon) gamesA++;
      else gamesB++;
    }
    // Series winner: whoever won more games in it (re-tally vs teamA param)
    let wa = 0;
    let wb = 0;
    for (const m of s.matches) {
      const aIsRadiant = m.radiant_team_id === teamA;
      const aWon = (m.radiant_win && aIsRadiant) || (!m.radiant_win && !aIsRadiant);
      if (aWon) wa++;
      else wb++;
    }
    if (wa > wb) seriesWinsA++;
    else if (wb > wa) seriesWinsB++;
  }
  return {
    seriesPlayed: series.size,
    seriesWinsA,
    seriesWinsB,
    gamesA,
    gamesB,
  };
}

// When predicting a game that belongs to an ongoing series, return a per-match
// weight multiplier: games from the same series get boosted.
export function seriesWeightFor(
  match: ODLeagueMatch,
  targetSeriesId: number | null
): number {
  if (!targetSeriesId || targetSeriesId <= 0) return 1;
  return match.series_id === targetSeriesId ? 2.5 : 1;
}

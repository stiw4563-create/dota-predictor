// Player-on-hero enrichment, v1.0.
//
// The in-pool detail sampling gives sparse player-hero data (we cap detail
// fetches, and a player may appear in only a few games). For a real "does this
// player win on this hero" signal we query OpenDota directly:
//
//   /teams/{id}/players   → roster (account_ids, games_played)
//   /players/{id}/heroes  → that player's per-hero games + wins (all-time)
//
// We pull the top ~5 current roster members per team and their hero stats,
// then expose a lookup the prediction model uses for ΔHeroFit.
//
// All cached 6h; we limit concurrency to stay under the 60 req/min free tier.

import { od } from './opendota';

export interface RosterPlayer {
  accountId: number;
  name: string;
  gamesPlayed: number;
}

export interface PlayerHeroStat {
  games: number;
  wins: number;
  winrate: number;
  lastPlayed: number;
}

// accountId → (heroId → stat)
export type PlayerHeroIndex = Map<number, Map<number, PlayerHeroStat>>;

export interface TeamRosterData {
  teamId: number;
  players: RosterPlayer[];
  heroIndex: PlayerHeroIndex;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const res = await Promise.all(batch.map(fn));
    out.push(...res);
  }
  return out;
}

// Fetch roster + per-player hero stats for one team.
export async function getTeamRosterData(teamId: number): Promise<TeamRosterData> {
  let roster: RosterPlayer[] = [];
  try {
    const players = await od.teamPlayers(teamId);
    // Prefer current members; sort by games on team; take top 5.
    roster = players
      .filter((p) => p.account_id)
      .sort((a, b) => {
        // current members first, then by games_played
        const ca = a.is_current_team_member ? 1 : 0;
        const cb = b.is_current_team_member ? 1 : 0;
        if (ca !== cb) return cb - ca;
        return (b.games_played ?? 0) - (a.games_played ?? 0);
      })
      .slice(0, 5)
      .map((p) => ({
        accountId: p.account_id,
        name: p.name || `Player ${p.account_id}`,
        gamesPlayed: p.games_played ?? 0,
      }));
  } catch {
    roster = [];
  }

  const heroIndex: PlayerHeroIndex = new Map();
  await mapWithConcurrency(roster, 3, async (p) => {
    try {
      const heroes = await od.playerHeroes(p.accountId);
      const m = new Map<number, PlayerHeroStat>();
      for (const h of heroes) {
        if (!h.games) continue;
        m.set(h.hero_id, {
          games: h.games,
          wins: h.win,
          winrate: h.games > 0 ? h.win / h.games : 0,
          lastPlayed: h.last_played,
        });
      }
      heroIndex.set(p.accountId, m);
    } catch {
      heroIndex.set(p.accountId, new Map());
    }
  });

  return { teamId, players: roster, heroIndex };
}

// Convenience: best player-on-hero winrate for a given hero across a roster,
// with Bayesian shrink toward 0.5 for small samples.
export function bestHeroFit(
  data: TeamRosterData,
  heroId: number,
  shrinkPrior = 4
): { winrate: number; games: number; accountId: number | null; name: string } {
  let best = { winrate: 0.5, games: 0, accountId: null as number | null, name: '' };
  let bestEdge = 0;
  for (const p of data.players) {
    const stat = data.heroIndex.get(p.accountId)?.get(heroId);
    if (!stat) continue;
    const shrink = stat.games / (stat.games + shrinkPrior);
    const edge = Math.abs((stat.winrate - 0.5) * shrink);
    if (edge >= bestEdge || stat.games > best.games) {
      bestEdge = edge;
      best = {
        winrate: stat.winrate,
        games: stat.games,
        accountId: p.accountId,
        name: p.name,
      };
    }
  }
  return best;
}

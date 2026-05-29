// Aggregates raw league matches into the inputs our model needs.
// Now identity-aware: H2H, Elo, form all use the team's identity cluster,
// so rosters that renamed (Team Liquid → Nigma → Nigma Galaxy) stay coherent.

import type {
  ODLeagueMatch,
  ODMatchDetail,
  HeroStatsInPool,
  TeamStatsInPool,
  H2HRecord,
  PlayerStats,
} from './types';
import {
  buildRosters,
  clusterIdentities,
  type IdentityCluster,
} from './identity';

export const AGG_PARAMS = {
  TIME_HALFLIFE_DAYS: 60,
  FORM_HALFLIFE_MATCHES: 5,
  ELO_BASE: 1500,
  ELO_K: 28,
  TIER_WEIGHT: {
    premium: 1.0,
    professional: 0.7,
  } as Record<string, number>,
};

function timeWeight(matchUnix: number, refUnix: number) {
  const days = Math.max(0, (refUnix - matchUnix) / 86400);
  return Math.pow(0.5, days / AGG_PARAMS.TIME_HALFLIFE_DAYS);
}

// ───────── Identity-aware Elo ─────────
//
// We run Elo on identity clusters, not team_ids. That way when a team renames,
// their Elo carries over.

function eloExpected(ra: number, rb: number) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

export function runEloAcrossMatches(
  matches: ODLeagueMatch[],
  clusters: Map<number, IdentityCluster>
) {
  // Map team_id → identity key; for unknown teams fall back to team_id.
  const key = (teamId: number | null) => {
    if (!teamId) return null;
    const c = clusters.get(teamId);
    return c ? `c${c.clusterId}` : `t${teamId}`;
  };

  const ratings = new Map<string, number>();
  const ordered = [...matches].sort((a, b) => a.start_time - b.start_time);
  for (const m of ordered) {
    const ka = key(m.radiant_team_id);
    const kb = key(m.dire_team_id);
    if (!ka || !kb) continue;
    const ra = ratings.get(ka) ?? AGG_PARAMS.ELO_BASE;
    const rb = ratings.get(kb) ?? AGG_PARAMS.ELO_BASE;
    const ea = eloExpected(ra, rb);
    const sa = m.radiant_win ? 1 : 0;
    const k = AGG_PARAMS.ELO_K;
    ratings.set(ka, ra + k * (sa - ea));
    ratings.set(kb, rb + k * ((1 - sa) - (1 - ea)));
  }
  return ratings;
}

// ───────── Team stats (identity-aware) ─────────

export function computeTeamStats(
  teamId: number,
  matches: ODLeagueMatch[],
  elo: Map<string, number>,
  clusters: Map<number, IdentityCluster>
): TeamStatsInPool | null {
  const cluster = clusters.get(teamId);
  const memberIds = cluster ? new Set(cluster.teamIds) : new Set([teamId]);
  const own = matches
    .filter(
      (m) =>
        (m.radiant_team_id && memberIds.has(m.radiant_team_id)) ||
        (m.dire_team_id && memberIds.has(m.dire_team_id))
    )
    .sort((a, b) => b.start_time - a.start_time);
  if (!own.length) return null;

  let wins = 0;
  for (const m of own) {
    const isRadiant = m.radiant_team_id !== null && memberIds.has(m.radiant_team_id);
    if ((m.radiant_win && isRadiant) || (!m.radiant_win && !isRadiant)) wins++;
  }

  let weightedWins = 0;
  let weightedTotal = 0;
  own.forEach((m, idx) => {
    const w = Math.pow(0.5, idx / AGG_PARAMS.FORM_HALFLIFE_MATCHES);
    const isRadiant = m.radiant_team_id !== null && memberIds.has(m.radiant_team_id);
    const win = (m.radiant_win && isRadiant) || (!m.radiant_win && !isRadiant);
    weightedTotal += w;
    if (win) weightedWins += w;
  });

  const eloKey = cluster ? `c${cluster.clusterId}` : `t${teamId}`;

  return {
    teamId: cluster ? cluster.primaryTeamId : teamId,
    name: cluster ? cluster.primaryName : (own[0].radiant_team_id === teamId ? own[0].radiant_name : own[0].dire_name) ?? `Team ${teamId}`,
    matches: own.length,
    wins,
    winrate: wins / own.length,
    recentFormWR: weightedTotal > 0 ? weightedWins / weightedTotal : 0.5,
    elo: elo.get(eloKey) ?? AGG_PARAMS.ELO_BASE,
    lastSeen: own[0].start_time,
    aliases: cluster?.aliases ?? [],
    coreRoster: cluster?.coreRoster ?? [],
    identityClusterId: cluster?.clusterId ?? -1,
  };
}

// ───────── Identity-aware H2H ─────────

export function computeH2H(
  teamA: number,
  teamB: number,
  matches: ODLeagueMatch[],
  clusters: Map<number, IdentityCluster>
): H2HRecord {
  const clusterA = clusters.get(teamA);
  const clusterB = clusters.get(teamB);
  const idsA = new Set(clusterA?.teamIds ?? [teamA]);
  const idsB = new Set(clusterB?.teamIds ?? [teamB]);

  const exact = matches.filter(
    (m) =>
      (m.radiant_team_id === teamA && m.dire_team_id === teamB) ||
      (m.radiant_team_id === teamB && m.dire_team_id === teamA)
  );
  let winsAExact = 0;
  for (const m of exact) {
    const aIsRadiant = m.radiant_team_id === teamA;
    const aWon = (m.radiant_win && aIsRadiant) || (!m.radiant_win && !aIsRadiant);
    if (aWon) winsAExact++;
  }

  const cluster = matches.filter(
    (m) =>
      m.radiant_team_id !== null &&
      m.dire_team_id !== null &&
      ((idsA.has(m.radiant_team_id) && idsB.has(m.dire_team_id)) ||
        (idsB.has(m.radiant_team_id) && idsA.has(m.dire_team_id)))
  );
  let winsAClu = 0;
  for (const m of cluster) {
    const aIsRadiant = m.radiant_team_id !== null && idsA.has(m.radiant_team_id);
    const aWon = (m.radiant_win && aIsRadiant) || (!m.radiant_win && !aIsRadiant);
    if (aWon) winsAClu++;
  }

  return {
    teamA,
    teamB,
    totalGames: exact.length,
    winsA: winsAExact,
    winsB: exact.length - winsAExact,
    clusterTotalGames: cluster.length,
    clusterWinsA: winsAClu,
    clusterWinsB: cluster.length - winsAClu,
  };
}

// ───────── Hero pool stats with bans & pick order ─────────

export function computeHeroSidePool(
  details: ODMatchDetail[],
  leagueTier: Map<number, string>
): { heroStats: Record<number, HeroStatsInPool>; radiantWR: number; total: number } {
  const stats = new Map<number, HeroStatsInPool>();
  const pickOrders = new Map<number, number[]>();
  const refUnix = Math.floor(Date.now() / 1000);
  let weightedRadWins = 0;
  let weightedTotal = 0;

  const ensure = (id: number): HeroStatsInPool => {
    let s = stats.get(id);
    if (!s) {
      s = {
        heroId: id,
        radiantGames: 0,
        radiantWins: 0,
        direGames: 0,
        direWins: 0,
        radiantWR: 0,
        direWR: 0,
        totalGames: 0,
        bans: 0,
        pickPriority: 25,
      };
      stats.set(id, s);
    }
    return s;
  };

  for (const m of details) {
    if (!m.picks_bans) continue;
    const tier = leagueTier.get(m.leagueid) ?? 'professional';
    const tierW = AGG_PARAMS.TIER_WEIGHT[tier] ?? 0.5;
    const w = timeWeight(m.start_time, refUnix) * tierW;
    weightedTotal += w;
    if (m.radiant_win) weightedRadWins += w;

    for (const pb of m.picks_bans) {
      const s = ensure(pb.hero_id);
      if (!pb.is_pick) {
        s.bans += w;
        continue;
      }
      if (pb.team === 0) {
        s.radiantGames += w;
        if (m.radiant_win) s.radiantWins += w;
      } else {
        s.direGames += w;
        if (!m.radiant_win) s.direWins += w;
      }
      const arr = pickOrders.get(pb.hero_id) ?? [];
      arr.push(pb.order);
      pickOrders.set(pb.hero_id, arr);
    }
  }

  const out: Record<number, HeroStatsInPool> = {};
  for (const [id, s] of stats) {
    s.radiantWR = s.radiantGames > 0 ? s.radiantWins / s.radiantGames : 0.5;
    s.direWR = s.direGames > 0 ? s.direWins / s.direGames : 0.5;
    s.totalGames = s.radiantGames + s.direGames;
    const orders = pickOrders.get(id);
    if (orders && orders.length) {
      s.pickPriority = orders.reduce((a, b) => a + b, 0) / orders.length;
    }
    out[id] = s;
  }
  return {
    heroStats: out,
    radiantWR: weightedTotal > 0 ? weightedRadWins / weightedTotal : 0.5,
    total: weightedTotal,
  };
}

// ───────── Player stats: who plays what, with what success ─────────

export function computePlayerStats(
  details: ODMatchDetail[],
  matchIndex: Map<number, ODLeagueMatch>
): Map<number, PlayerStats> {
  const result = new Map<number, PlayerStats>();
  for (const d of details) {
    if (!d.players) continue;
    const meta = matchIndex.get(d.match_id);
    if (!meta) continue;
    for (const p of d.players) {
      if (!p.account_id || p.account_id === 0) continue;
      let ps = result.get(p.account_id);
      if (!ps) {
        ps = {
          accountId: p.account_id,
          matches: 0,
          wins: 0,
          winrate: 0,
          heroes: {},
          teamId: null,
          name: p.personaname || p.name || `Player ${p.account_id}`,
        };
        result.set(p.account_id, ps);
      }
      ps.matches++;
      const won = (p.isRadiant && meta.radiant_win) || (!p.isRadiant && !meta.radiant_win);
      if (won) ps.wins++;
      ps.teamId = p.isRadiant ? meta.radiant_team_id : meta.dire_team_id;
      const h = ps.heroes[p.hero_id] ?? { games: 0, wins: 0, winrate: 0 };
      h.games++;
      if (won) h.wins++;
      h.winrate = h.wins / h.games;
      ps.heroes[p.hero_id] = h;
      if (p.personaname) ps.name = p.personaname;
    }
  }
  for (const ps of result.values()) ps.winrate = ps.matches > 0 ? ps.wins / ps.matches : 0;
  return result;
}

// ───────── Counter-pick winrate ─────────
// For a hero, the WR when it played AGAINST any of `enemyDraft` in the pool.

export function counterPickWR(
  heroId: number,
  enemyDraft: number[],
  details: ODMatchDetail[]
): { winrate: number; sample: number } {
  if (enemyDraft.length === 0) return { winrate: 0.5, sample: 0 };
  let wins = 0;
  let games = 0;
  for (const d of details) {
    if (!d.picks_bans) continue;
    const radiantHeroes = new Set(
      d.picks_bans.filter((p) => p.is_pick && p.team === 0).map((p) => p.hero_id)
    );
    const direHeroes = new Set(
      d.picks_bans.filter((p) => p.is_pick && p.team === 1).map((p) => p.hero_id)
    );
    const onRadiant = radiantHeroes.has(heroId);
    const onDire = direHeroes.has(heroId);
    if (!onRadiant && !onDire) continue;
    const enemyHeroes = onRadiant ? direHeroes : radiantHeroes;
    let facedAny = false;
    for (const e of enemyDraft) if (enemyHeroes.has(e)) { facedAny = true; break; }
    if (!facedAny) continue;
    games++;
    const heroWon = (onRadiant && d.radiant_win) || (onDire && !d.radiant_win);
    if (heroWon) wins++;
  }
  return { winrate: games > 0 ? wins / games : 0.5, sample: games };
}

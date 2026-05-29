// Shared feature extraction, v2.0.
//
// CRITICAL: training and inference must compute features identically, or the
// learned weights won't apply. This module is the single source of truth for
// turning raw match context into a FeatureVector.

import type {
  HeroStatsInPool,
  TeamStatsInPool,
  H2HRecord,
  PlayerStats,
  Side,
} from './types';
import type { FeatureVector } from './train';

export interface FeatureContext {
  teamA: TeamStatsInPool | null;
  teamB: TeamStatsInPool | null;
  sideA: Side;
  heroesA: number[];
  heroesB: number[];
  heroPool: Record<number, HeroStatsInPool>;
  poolRadiantWR: number;
  h2h: H2HRecord;
  players: Map<number, PlayerStats>;
  seriesH2H?: {
    seriesPlayed: number;
    seriesWinsA: number;
    seriesWinsB: number;
  } | null;
  // hero matchup table: heroId → { vsHeroId → winrate } (optional)
  matchups?: Map<number, Map<number, { wr: number; games: number }>>;
}

const clamp = (x: number, max: number) => Math.max(-max, Math.min(max, x));

export function extractFeatures(ctx: FeatureContext): FeatureVector {
  // ── Elo ──
  const aElo = ctx.teamA?.elo ?? 1500;
  const bElo = ctx.teamB?.elo ?? 1500;
  const deltaElo = (aElo - bElo) / 400;

  // ── Form ──
  const deltaForm = (ctx.teamA?.recentFormWR ?? 0.5) - (ctx.teamB?.recentFormWR ?? 0.5);

  // ── H2H (series-adjusted if available) ──
  let h2h = 0;
  if (ctx.seriesH2H && ctx.seriesH2H.seriesPlayed > 0) {
    const sh = ctx.seriesH2H;
    const wr = sh.seriesWinsA / sh.seriesPlayed;
    h2h = Math.tanh((wr - 0.5) * Math.sqrt(sh.seriesPlayed));
  } else {
    const useCluster =
      ctx.h2h.totalGames < 3 && ctx.h2h.clusterTotalGames > ctx.h2h.totalGames;
    const total = useCluster ? ctx.h2h.clusterTotalGames : ctx.h2h.totalGames;
    const winsA = useCluster ? ctx.h2h.clusterWinsA : ctx.h2h.winsA;
    if (total > 0) h2h = Math.tanh((winsA / total - 0.5) * Math.sqrt(total));
  }

  // ── Draft (side-specific hero pool WR) ──
  const sideB: Side = ctx.sideA === 'radiant' ? 'dire' : 'radiant';
  const heroEdge = (heroId: number, side: Side): number => {
    const s = ctx.heroPool[heroId];
    if (!s) return 0;
    const g = side === 'radiant' ? s.radiantGames : s.direGames;
    const wr = side === 'radiant' ? s.radiantWR : s.direWR;
    return (wr - 0.5) * (g / (g + 6));
  };
  const draftA = ctx.heroesA.reduce((a, h) => (h ? a + heroEdge(h, ctx.sideA) : a), 0);
  const draftB = ctx.heroesB.reduce((a, h) => (h ? a + heroEdge(h, sideB) : a), 0);
  const deltaDraft = draftA - draftB;

  // ── Hero matchup ──
  let deltaMatchup = 0;
  if (ctx.matchups) {
    let sum = 0;
    let count = 0;
    for (const ha of ctx.heroesA) {
      if (!ha) continue;
      const row = ctx.matchups.get(ha);
      if (!row) continue;
      for (const hb of ctx.heroesB) {
        if (!hb) continue;
        const m = row.get(hb);
        if (m && m.games >= 3) {
          sum += (m.wr - 0.5) * (m.games / (m.games + 5));
          count++;
        }
      }
    }
    deltaMatchup = count > 0 ? sum / Math.sqrt(count) : 0;
  }

  // ── Side advantage ──
  const sideAdv =
    ctx.sideA === 'radiant' ? ctx.poolRadiantWR - 0.5 : 0.5 - ctx.poolRadiantWR;

  // ── Pick priority ──
  const pickPrio = (heroes: number[]) => {
    let sum = 0;
    let count = 0;
    for (const h of heroes) {
      if (!h) continue;
      const s = ctx.heroPool[h];
      if (!s) continue;
      sum += Math.max(-1, Math.min(1, (8 - s.pickPriority) / 8));
      count++;
    }
    return count > 0 ? sum / count : 0;
  };
  const deltaPickPrio = pickPrio(ctx.heroesA) - pickPrio(ctx.heroesB);

  // ── Gold/XP dominance (NEW) ──
  // Historical average late-game gold+xp advantage of team A minus team B.
  // Teams that consistently build economic leads tend to win. Provided by the
  // caller via teamA/teamB.avgGoldXpAdv (computed from past matches' graphs).
  const goldXpA = ctx.teamA?.avgGoldXpAdv ?? 0;
  const goldXpB = ctx.teamB?.avgGoldXpAdv ?? 0;
  const deltaGoldExp = (goldXpA - goldXpB) / 5000; // normalize ~gold units

  return {
    deltaElo: clamp(deltaElo, 5),
    deltaForm: clamp(deltaForm, 1),
    h2h: clamp(h2h, 1),
    deltaDraft: clamp(deltaDraft, 3),
    sideAdv: clamp(sideAdv, 0.5),
    deltaPickPrio: clamp(deltaPickPrio, 1),
    deltaMatchup: clamp(deltaMatchup, 2),
    deltaGoldExp: clamp(deltaGoldExp, 3),
  };
}

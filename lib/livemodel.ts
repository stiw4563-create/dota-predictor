// Live in-game win-probability model, v3.0.
//
// Unlike pre-game prediction (which tops out near coin-flip for evenly-matched
// pro teams), the IN-GAME state is directly predictive: a team that is ahead in
// net worth at minute N usually closes the game out. This is honest signal —
// we're reading the current game state, not guessing from paper stats.
//
// Model:
//   lead = (radiant_gold_adv + radiant_xp_adv)   // net resource lead
//   The value of a fixed lead GROWS as the game progresses (a 10k lead at 15min
//   is recoverable; at 40min it's usually decisive). We scale by game time.
//
//   z = lead / scale(t)
//   P(radiant win) = sigmoid(z)
//
// where scale(t) shrinks with time, so the same lead → higher confidence later.
// Coefficients are seeded from Dota community win-probability studies and can be
// refined by calibrating against our stored final outcomes.

export interface LiveState {
  radiantGoldAdv: number; // current gold advantage (radiant - dire)
  radiantXpAdv: number; // current xp advantage
  gameTimeSec: number; // seconds since horn (can be negative pre-horn)
  radiantScore?: number; // kills
  direScore?: number;
}

export interface LivePrediction {
  probRadiant: number;
  probDire: number;
  netLead: number; // gold + xp, radiant perspective
  minute: number;
  confidence: 'high' | 'medium' | 'low';
  note: string;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));

// Scale factor: how big a net lead must be to mean "winning" at a given minute.
// Early game leads are noisy (comebacks common); late game leads are decisive.
// Roughly: at 10min need ~15k for strong confidence; at 40min ~6k suffices.
function leadScale(minute: number): number {
  // Linear decay from 16000 (min 0) to ~5000 (min 45+), floored.
  const s = 16000 - minute * 250;
  return Math.max(5000, s);
}

export function predictLive(state: LiveState): LivePrediction {
  const minute = Math.max(0, state.gameTimeSec / 60);
  const netLead = state.radiantGoldAdv + state.radiantXpAdv;

  // Kill-score also carries signal, especially early; fold in a small term.
  const killDiff = (state.radiantScore ?? 0) - (state.direScore ?? 0);

  const scale = leadScale(minute);
  // Net-worth term + a modest kill-momentum term.
  const z = netLead / scale + killDiff * 0.04;

  const probRadiant = sigmoid(z);
  const margin = Math.abs(probRadiant - 0.5);

  let confidence: 'high' | 'medium' | 'low';
  let note: string;
  if (minute < 8) {
    confidence = 'low';
    note = 'Ранняя стадия — лиды легко отыгрываются.';
  } else if (margin > 0.32) {
    confidence = 'high';
    note = 'Значительное преимущество на текущей стадии игры.';
  } else if (margin > 0.15) {
    confidence = 'medium';
    note = 'Заметный перевес, но исход ещё может измениться.';
  } else {
    confidence = 'low';
    note = 'Игра идёт практически вровень.';
  }

  return {
    probRadiant,
    probDire: 1 - probRadiant,
    netLead,
    minute: Math.round(minute),
    confidence,
    note,
  };
}

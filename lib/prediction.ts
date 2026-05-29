// Prediction, v2.0.
//
// Two-tier model:
//   1. TRAINED logistic regression (weights learned from history) — used when a
//      trained model is available in KV. Features come from extractFeatures().
//   2. HAND-TUNED fallback — the original β weights, used before first training.
//
// Both consume the same FeatureVector, so the breakdown UI works either way.

import type {
  Prediction,
  HeroStatsInPool,
  TeamStatsInPool,
  H2HRecord,
  PlayerStats,
  Side,
} from './types';
import { type TeamRosterData } from './roster';
import {
  applyCalibration,
  getCachedCalibration,
  type CalibrationParams,
} from './calibration';
import { extractFeatures, type FeatureContext } from './features';
import {
  scoreTrained,
  FEATURE_NAMES,
  type TrainedModel,
  type FeatureVector,
} from './train';

// Hand-tuned weights (fallback when no trained model yet).
export const MODEL_WEIGHTS: Record<string, number> = {
  deltaElo: 2.3,
  deltaForm: 1.2,
  h2h: 0.6,
  deltaDraft: 2.6,
  sideAdv: 1.8,
  deltaPickPrio: 0.4,
  deltaMatchup: 1.5,
  deltaGoldExp: 1.5,
};

const sigmoid = (x: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));

interface SeriesH2H {
  seriesPlayed: number;
  seriesWinsA: number;
  seriesWinsB: number;
  gamesA: number;
  gamesB: number;
}

interface PredictInput {
  teamA: TeamStatsInPool | null;
  teamB: TeamStatsInPool | null;
  sideA: Side;
  heroesA: number[];
  heroesB: number[];
  heroPool: Record<number, HeroStatsInPool>;
  poolRadiantWR: number;
  poolMatches: number;
  h2h: H2HRecord;
  players: Map<number, PlayerStats>;
  rosterA?: TeamRosterData | null;
  rosterB?: TeamRosterData | null;
  seriesH2H?: SeriesH2H | null;
  matchups?: Map<number, Map<number, { wr: number; games: number }>>;
  calibration?: CalibrationParams | null;
  trainedModel?: TrainedModel | null;
}

export function predict(input: PredictInput): Prediction {
  const ctx: FeatureContext = {
    teamA: input.teamA,
    teamB: input.teamB,
    sideA: input.sideA,
    heroesA: input.heroesA,
    heroesB: input.heroesB,
    heroPool: input.heroPool,
    poolRadiantWR: input.poolRadiantWR,
    h2h: input.h2h,
    players: input.players,
    seriesH2H: input.seriesH2H,
    matchups: input.matchups,
  };
  const features = extractFeatures(ctx);

  let logit: number;
  let usedTrained = false;

  if (input.trainedModel) {
    // Trained path: standardized features, learned weights.
    const p = scoreTrained(features, input.trainedModel);
    logit = Math.log(p / (1 - p));
    usedTrained = true;
  } else {
    // Hand-tuned fallback.
    const clampC = (x: number, max = 3) => Math.max(-max, Math.min(max, x));
    logit = 0;
    for (const f of FEATURE_NAMES) {
      logit += clampC((MODEL_WEIGHTS[f] ?? 0) * features[f]);
    }
  }

  const rawProbA = sigmoid(logit);
  const calib = input.calibration ?? getCachedCalibration();
  const probA = calib ? applyCalibration(logit, calib) : rawProbA;

  // ── Honest confidence ──
  // Low if the prediction is near a coin-flip OR the model's held-out accuracy
  // shows it barely beats chance. We never overstate certainty.
  const margin = Math.abs(probA - 0.5); // 0 = coin flip, 0.5 = certain
  const heldAcc = input.trainedModel?.heldOutAccuracy;
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  let confidenceNote = '';
  if (heldAcc != null && heldAcc < 0.55) {
    confidence = 'low';
    confidenceNote =
      'Модель на исторических данных предсказывает близко к случайности — прогноз ориентировочный.';
  } else if (margin < 0.06) {
    confidence = 'low';
    confidenceNote = 'Команды примерно равны — исход почти непредсказуем.';
  } else if (margin < 0.15) {
    confidence = 'medium';
    confidenceNote = 'Умеренный перевес, но в про-Доте апсеты обычны.';
  } else {
    confidence = 'high';
    confidenceNote = 'Заметный перевес по модели.';
  }

  // Build contribution breakdown (per-feature signed logit pieces).
  const contributions = buildContributions(features, input.trainedModel);

  return {
    probA,
    probB: 1 - probA,
    rawProbA,
    logit,
    calibrated: !!calib,
    usedTrainedModel: usedTrained,
    confidence,
    confidenceNote,
    contributions,
    inputs: {
      deltaElo: features.deltaElo,
      deltaForm: features.deltaForm,
      h2hFactor: features.h2h,
      deltaDraft: features.deltaDraft,
      deltaHeroFit: features.deltaGoldExp,
      sideAdv: features.sideAdv,
      poolMatches: input.poolMatches,
      poolRadiantWR: input.poolRadiantWR,
    },
  };
}

// Per-feature contribution to the logit, for the UI breakdown bars.
function buildContributions(
  features: FeatureVector,
  trained: TrainedModel | null | undefined
) {
  const contrib = (f: keyof FeatureVector): number => {
    if (trained) {
      const x = (features[f] - trained.mean[f]) / (trained.std[f] || 1);
      return trained.weights[f] * x;
    }
    const clampC = (x: number, max = 3) => Math.max(-max, Math.min(max, x));
    return clampC((MODEL_WEIGHTS[f] ?? 0) * features[f]);
  };
  return {
    elo: contrib('deltaElo'),
    form: contrib('deltaForm'),
    h2h: contrib('h2h'),
    draft: contrib('deltaDraft') + contrib('deltaMatchup'),
    heroFit: contrib('deltaGoldExp'),
    side: contrib('sideAdv'),
  };
}

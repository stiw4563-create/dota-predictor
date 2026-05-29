// Model calibration via Platt scaling, v1.0.
//
// Our logistic model outputs a raw probability p = sigmoid(logit). But the
// hand-tuned weights mean p isn't necessarily *calibrated*: when we say 70%,
// the team might actually win 60% or 80% of the time. Platt scaling learns a
// 1-D logistic correction:
//
//   p_calibrated = sigmoid(A · logit_raw + B)
//
// fit on historical (logit_raw, actual_outcome) pairs by gradient descent on
// log-loss. A≈1, B≈0 means the model was already well-calibrated.
//
// The fitted (A, B) are cached and applied to live predictions. Backtesting
// also yields accuracy + Brier score + log-loss for display.

export interface CalibrationParams {
  a: number;
  b: number;
  // diagnostics from the fit
  samples: number;
  logLoss: number;
  brier: number;
  accuracy: number;
  fittedAt: number;
}

export interface BacktestPoint {
  logit: number; // raw model logit for team A (radiant)
  outcome: number; // 1 if radiant won, 0 otherwise
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));

// Fit A, B by minimizing log-loss with simple gradient descent.
export function fitPlatt(points: BacktestPoint[]): CalibrationParams {
  let a = 1;
  let b = 0;
  const n = points.length;
  if (n < 20) {
    // Not enough data to calibrate; return identity transform.
    return { a: 1, b: 0, samples: n, logLoss: NaN, brier: NaN, accuracy: NaN, fittedAt: Date.now() };
  }

  const lr = 0.05;
  const epochs = 500;
  for (let epoch = 0; epoch < epochs; epoch++) {
    let gradA = 0;
    let gradB = 0;
    for (const pt of points) {
      const z = a * pt.logit + b;
      const p = sigmoid(z);
      const err = p - pt.outcome; // dLogLoss/dz
      gradA += err * pt.logit;
      gradB += err;
    }
    gradA /= n;
    gradB /= n;
    a -= lr * gradA;
    b -= lr * gradB;
  }

  // Diagnostics
  let logLoss = 0;
  let brier = 0;
  let correct = 0;
  for (const pt of points) {
    const p = sigmoid(a * pt.logit + b);
    const clamped = Math.max(1e-9, Math.min(1 - 1e-9, p));
    logLoss += -(pt.outcome * Math.log(clamped) + (1 - pt.outcome) * Math.log(1 - clamped));
    brier += (p - pt.outcome) ** 2;
    const predicted = p >= 0.5 ? 1 : 0;
    if (predicted === pt.outcome) correct++;
  }

  return {
    a,
    b,
    samples: n,
    logLoss: logLoss / n,
    brier: brier / n,
    accuracy: correct / n,
    fittedAt: Date.now(),
  };
}

export function applyCalibration(logit: number, params: CalibrationParams | null): number {
  if (!params) return sigmoid(logit);
  return sigmoid(params.a * logit + params.b);
}

// ─── In-memory cache for fitted params (per serverless instance) ───
let cachedParams: CalibrationParams | null = null;

export function getCachedCalibration(): CalibrationParams | null {
  return cachedParams;
}

export function setCachedCalibration(p: CalibrationParams): void {
  cachedParams = p;
}

// ─── Persistent storage via KV ───
import { kvGet, kvSet } from './kv';

const KV_KEY = 'calibration:v1';

// Load calibration: prefer in-memory, then KV. Populates the in-memory cache.
export async function loadCalibration(): Promise<CalibrationParams | null> {
  if (cachedParams) return cachedParams;
  const stored = await kvGet<CalibrationParams>(KV_KEY);
  if (stored) cachedParams = stored;
  return cachedParams;
}

// Persist calibration to both memory and KV.
export async function saveCalibration(p: CalibrationParams): Promise<void> {
  cachedParams = p;
  await kvSet(KV_KEY, p);
}

// ─── Trained model storage (separate key) ───
import type { TrainedModel } from './train';

const MODEL_KEY = 'trained-model:v2';
let cachedModel: TrainedModel | null = null;
let modelLoaded = false;

export async function loadTrainedModel(): Promise<TrainedModel | null> {
  if (cachedModel) return cachedModel;
  if (modelLoaded) return null;
  modelLoaded = true;
  const stored = await kvGet<TrainedModel>(MODEL_KEY);
  if (stored) cachedModel = stored;
  return cachedModel;
}

export async function saveTrainedModel(m: TrainedModel): Promise<void> {
  cachedModel = m;
  await kvSet(MODEL_KEY, m);
}

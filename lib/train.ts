// Trainable logistic regression, v2.0.
//
// Replaces hand-tuned β weights with weights LEARNED from historical outcomes.
//
//   P(radiant win) = sigmoid(Σ wᵢ·xᵢ + bias)
//
// Trained by gradient descent on log-loss with:
//   - L2 regularization (prevents overfit on small samples)
//   - per-sample time-decay weighting (recent matches matter more → patch aware)
//   - feature standardization (z-score) so weights are comparable & GD is stable
//
// The learned model (weights + feature means/stds) is persisted to KV and used
// by /api/analyze. Falls back to the hand-tuned model when no trained weights
// exist yet.

export const FEATURE_NAMES = [
  'deltaElo',
  'deltaForm',
  'h2h',
  'deltaDraft',
  'sideAdv',
  'deltaPickPrio',
  'deltaMatchup', // hero-vs-hero counter matchup score
  'deltaGoldExp', // NEW: historical avg gold+xp advantage of the teams
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export type FeatureVector = Record<FeatureName, number>;

export interface TrainedModel {
  weights: Record<FeatureName, number>;
  bias: number;
  // standardization params
  mean: Record<FeatureName, number>;
  std: Record<FeatureName, number>;
  // diagnostics
  samples: number;
  logLoss: number;
  accuracy: number;
  brier: number;
  l2: number;
  trainedAt: number;
  patchWindow?: string;
  // honest out-of-sample metrics (set by the training endpoint)
  heldOutAccuracy?: number;
  heldOutLogLoss?: number;
}

export interface TrainingSample {
  features: FeatureVector;
  outcome: number; // 1 radiant win, 0 loss
  ageDays: number; // for time-decay weighting
}

const sigmoid = (x: number) =>
  1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));

function zeroVec(): Record<FeatureName, number> {
  const o = {} as Record<FeatureName, number>;
  for (const f of FEATURE_NAMES) o[f] = 0;
  return o;
}

// Standardize features: compute mean/std across samples.
function computeStandardization(samples: TrainingSample[]) {
  const mean = zeroVec();
  const std = zeroVec();
  const n = samples.length;
  for (const s of samples) {
    for (const f of FEATURE_NAMES) mean[f] += s.features[f] / n;
  }
  for (const s of samples) {
    for (const f of FEATURE_NAMES) {
      const d = s.features[f] - mean[f];
      std[f] += (d * d) / n;
    }
  }
  for (const f of FEATURE_NAMES) {
    std[f] = Math.sqrt(std[f]) || 1; // guard against zero variance
  }
  return { mean, std };
}

// Time-decay weight: half-life of ~90 days, so older matches count less.
function decayWeight(ageDays: number, halfLifeDays = 90): number {
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export interface TrainOptions {
  epochs?: number;
  lr?: number;
  l2?: number;
  halfLifeDays?: number;
}

export function trainLogistic(
  samples: TrainingSample[],
  opts: TrainOptions = {}
): TrainedModel | null {
  const n = samples.length;
  if (n < 50) return null; // need a reasonable amount of data

  const epochs = opts.epochs ?? 800;
  const lr = opts.lr ?? 0.1;
  const l2 = opts.l2 ?? 0.01;
  const halfLife = opts.halfLifeDays ?? 90;

  const { mean, std } = computeStandardization(samples);

  // Pre-standardize + precompute sample weights
  const X: number[][] = [];
  const y: number[] = [];
  const sw: number[] = [];
  let swSum = 0;
  for (const s of samples) {
    const row = FEATURE_NAMES.map((f) => (s.features[f] - mean[f]) / std[f]);
    X.push(row);
    y.push(s.outcome);
    const w = decayWeight(s.ageDays, halfLife);
    sw.push(w);
    swSum += w;
  }

  const W = new Array(FEATURE_NAMES.length).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array(FEATURE_NAMES.length).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      let z = bias;
      for (let k = 0; k < W.length; k++) z += W[k] * X[i][k];
      const p = sigmoid(z);
      const err = (p - y[i]) * sw[i];
      for (let k = 0; k < W.length; k++) gradW[k] += err * X[i][k];
      gradB += err;
    }
    // L2 + average over weighted samples
    for (let k = 0; k < W.length; k++) {
      gradW[k] = gradW[k] / swSum + l2 * W[k];
      W[k] -= lr * gradW[k];
    }
    bias -= lr * (gradB / swSum);
  }

  // Diagnostics (unweighted, on training set)
  let logLoss = 0;
  let brier = 0;
  let correct = 0;
  for (let i = 0; i < n; i++) {
    let z = bias;
    for (let k = 0; k < W.length; k++) z += W[k] * X[i][k];
    const p = sigmoid(z);
    const c = Math.max(1e-9, Math.min(1 - 1e-9, p));
    logLoss += -(y[i] * Math.log(c) + (1 - y[i]) * Math.log(1 - c));
    brier += (p - y[i]) ** 2;
    if ((p >= 0.5 ? 1 : 0) === y[i]) correct++;
  }

  const weights = zeroVec();
  FEATURE_NAMES.forEach((f, k) => (weights[f] = W[k]));

  return {
    weights,
    bias,
    mean,
    std,
    samples: n,
    logLoss: logLoss / n,
    accuracy: correct / n,
    brier: brier / n,
    l2,
    trainedAt: Date.now(),
  };
}

// Score a feature vector with a trained model → probability.
export function scoreTrained(
  features: FeatureVector,
  model: TrainedModel
): number {
  let z = model.bias;
  for (const f of FEATURE_NAMES) {
    const x = (features[f] - model.mean[f]) / (model.std[f] || 1);
    z += model.weights[f] * x;
  }
  return sigmoid(z);
}

// Evaluate a trained model on held-out samples (out-of-sample metrics).
export function evaluate(
  model: TrainedModel,
  samples: TrainingSample[]
): { accuracy: number; logLoss: number; brier: number; n: number } {
  if (samples.length === 0) return { accuracy: NaN, logLoss: NaN, brier: NaN, n: 0 };
  let correct = 0;
  let logLoss = 0;
  let brier = 0;
  for (const s of samples) {
    const p = scoreTrained(s.features, model);
    const c = Math.max(1e-9, Math.min(1 - 1e-9, p));
    logLoss += -(s.outcome * Math.log(c) + (1 - s.outcome) * Math.log(1 - c));
    brier += (p - s.outcome) ** 2;
    if ((p >= 0.5 ? 1 : 0) === s.outcome) correct++;
  }
  const n = samples.length;
  return { accuracy: correct / n, logLoss: logLoss / n, brier: brier / n, n };
}

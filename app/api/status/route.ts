// GET /api/status — dataset size + current model quality at a glance.

import { NextRequest, NextResponse } from 'next/server';
import { datasetSize, pruneOldMatches, resetDataset } from '@/lib/dataset';
import { loadTrainedModel, loadCalibration } from '@/lib/calibration';
import { kvIsPersistent } from '@/lib/kv';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Optional cleanup: ?prune=1 drops matches older than ~18 months.
  let pruned: number | null = null;
  if (req.nextUrl.searchParams.get('prune') === '1') {
    const cutoff = Math.floor(Date.now() / 1000) - 540 * 24 * 60 * 60;
    pruned = await pruneOldMatches(cutoff).catch(() => null);
  }
  // Optional full reset: ?reset=1 clears the dataset index (rebuild from scratch
  // with gold/xp fields). Existing data keys are orphaned but harmless.
  let reset = false;
  if (req.nextUrl.searchParams.get('reset') === '1') {
    await resetDataset().catch(() => {});
    reset = true;
  }

  const [size, model, calib] = await Promise.all([
    datasetSize().catch(() => 0),
    loadTrainedModel().catch(() => null),
    loadCalibration().catch(() => null),
  ]);

  return NextResponse.json({
    kvPersistent: kvIsPersistent(),
    datasetSize: size,
    pruned,
    reset,
    model: model
      ? {
          trainedAt: new Date(model.trainedAt).toISOString(),
          trainedOnSamples: model.samples,
          inSampleAccuracy: model.accuracy,
          heldOutAccuracy: model.heldOutAccuracy ?? null,
          heldOutLogLoss: model.heldOutLogLoss ?? null,
          topWeights: Object.entries(model.weights)
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
            .slice(0, 5)
            .map(([k, v]) => ({ feature: k, weight: Number(v.toFixed(3)) })),
        }
      : null,
    calibration: calib ? { a: calib.a, b: calib.b, samples: calib.samples } : null,
  });
}

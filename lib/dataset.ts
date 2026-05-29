// Accumulated match dataset, v2.3.
//
// The core problem: OpenDota only reliably exposes a limited recent window, and
// pro-Dota needs THOUSANDS of matches to train a model that beats coin-flip.
// Solution: every day, harvest newly-played matches (with drafts + outcomes)
// and append them to a persistent store in KV. Over weeks this grows into a
// real dataset that training can use, independent of what the API shows "now".
//
// Storage layout (KV):
//   matches:index        → number[] of stored match_ids (dedup)
//   matches:data:{id}    → StoredMatch (compact: teams, draft, outcome, time)
//
// We keep records compact to fit KV value limits and stay cheap.

import { kvGet, kvSet } from './kv';

export interface StoredMatch {
  id: number;
  t: number; // start_time unix
  rt: number; // radiant_team_id
  dt: number; // dire_team_id
  rw: boolean; // radiant_win
  rp: number[]; // radiant hero picks
  dp: number[]; // dire hero picks
  lg: number; // league id
  st?: number; // series_type
  sid?: number; // series_id
  gx?: number; // final radiant gold+xp advantage (signed, radiant perspective)
}

const INDEX_KEY = 'matches:index';
const CURSOR_KEY = 'matches:backfill-cursor';
const DATA_PREFIX = 'matches:data:';
const MAX_STORED = 5000; // cap to keep KV usage bounded

export async function getStoredIndex(): Promise<number[]> {
  const idx = await kvGet<number[]>(INDEX_KEY);
  return idx ?? [];
}

export async function getStoredMatches(ids: number[]): Promise<StoredMatch[]> {
  const out: StoredMatch[] = [];
  // Batch reads where possible; KV get is per-key, so map in parallel.
  const results = await Promise.all(
    ids.map((id) => kvGet<StoredMatch>(`${DATA_PREFIX}${id}`).catch(() => null))
  );
  for (const r of results) if (r) out.push(r);
  return out;
}

export async function getAllStoredMatches(limit = MAX_STORED): Promise<StoredMatch[]> {
  const idx = await getStoredIndex();
  const slice = idx.slice(-limit);
  const matches = await getStoredMatches(slice);
  return matches.sort((a, b) => a.t - b.t);
}

// Append new matches, dedup by id, persist. Returns how many were newly added.
export async function appendMatches(records: StoredMatch[]): Promise<number> {
  if (records.length === 0) return 0;
  const idx = await getStoredIndex();
  const known = new Set(idx);
  let added = 0;
  const writes: Promise<void>[] = [];
  for (const r of records) {
    if (known.has(r.id)) continue;
    known.add(r.id);
    idx.push(r.id);
    writes.push(kvSet(`${DATA_PREFIX}${r.id}`, r));
    added++;
  }
  if (added === 0) return 0;
  // Trim index if over cap (drop oldest ids; their data keys stay but orphaned -
  // acceptable, or could be deleted. We keep it simple.)
  let trimmed = idx;
  if (idx.length > MAX_STORED) {
    trimmed = idx.slice(-MAX_STORED);
  }
  writes.push(kvSet(INDEX_KEY, trimmed));
  await Promise.all(writes);
  return added;
}

// Clear the dataset index (forces a fresh rebuild). Orphaned data keys remain
// but are harmless and get overwritten as new matches with the same ids arrive.
export async function resetDataset(): Promise<void> {
  await kvSet(INDEX_KEY, []);
  await kvSet(CURSOR_KEY, 0);
}

export async function datasetSize(): Promise<number> {
  const idx = await getStoredIndex();
  return idx.length;
}

// Remove matches older than cutoffUnix from the dataset (drops dead-patch data).
export async function pruneOldMatches(cutoffUnix: number): Promise<number> {
  const idx = await getStoredIndex();
  const all = await getStoredMatches(idx);
  const keep = all.filter((m) => m.t >= cutoffUnix);
  const removed = all.length - keep.length;
  if (removed > 0) {
    await kvSet(INDEX_KEY, keep.map((m) => m.id));
  }
  return removed;
}

// ─── Backfill rotation cursor ───
// Remembers which slice of historical tournaments to process next, so each
// cron run advances through the archive instead of re-scanning the same ones.

export async function getBackfillCursor(): Promise<number> {
  const c = await kvGet<number>(CURSOR_KEY);
  return c ?? 0;
}

export async function setBackfillCursor(n: number): Promise<void> {
  await kvSet(CURSOR_KEY, n);
}

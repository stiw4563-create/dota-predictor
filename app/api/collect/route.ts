// GET /api/collect           — harvest new live matches + backfill history
// GET /api/collect?mode=live — only live (skip backfill)
// GET /api/collect?mode=backfill — only history backfill
//
// Two jobs in one endpoint:
//   1. LIVE: grab newly-played matches from the current tier-1 pool.
//   2. BACKFILL: if the dataset is below TARGET, walk through PAST tournaments
//      (rotating via a KV cursor) and pull their matches too. This fills the
//      dataset to a usable size in days instead of waiting a month for live
//      matches to accumulate.
//
// Both bounded to fit the serverless time limit; cron runs daily.

import { NextRequest, NextResponse } from 'next/server';
import { od } from '@/lib/opendota';
import { buildTournamentPool } from '@/lib/tier';
import {
  appendMatches,
  getStoredIndex,
  datasetSize,
  getBackfillCursor,
  setBackfillCursor,
  type StoredMatch,
} from '@/lib/dataset';
import type { ODLeagueMatch } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TARGET_DATASET = 1200; // backfill until we reach this many matches
const MAX_NEW_DETAILS = 40; // detail fetches per run (time budget)
const BACKFILL_TOURNAMENTS_PER_RUN = 4; // how many past tournaments per run

// Modern Tier-1 series names — keeps backfill on current-era Dota only.
const TIER1_NAME_RE =
  /international|dreamleague|wallachia|blast slam|esl one|riyadh|fissure|major|champions|elite league|betboom|pgl|epl|games of the future|bb dacha|dreamhack|lima|birmingham/i;

// Turn raw league matches + their drafts into StoredMatch records.
async function harvest(
  matches: ODLeagueMatch[],
  storedIds: Set<number>,
  budget: number
): Promise<StoredMatch[]> {
  const fresh = matches
    .filter((m) => !storedIds.has(m.match_id))
    .sort((a, b) => b.start_time - a.start_time)
    .slice(0, budget);

  const records: StoredMatch[] = [];
  const CONC = 6;
  for (let i = 0; i < fresh.length; i += CONC) {
    const batch = fresh.slice(i, i + CONC);
    const details = await Promise.all(
      batch.map((m) => od.match(m.match_id).catch(() => null))
    );
    details.forEach((d, k) => {
      const m = batch[k];
      if (!d || !d.picks_bans || d.picks_bans.length === 0) return;
      // Final gold+xp advantage (radiant perspective): last value of each graph.
      const lastG = d.radiant_gold_adv?.length ? d.radiant_gold_adv[d.radiant_gold_adv.length - 1] : 0;
      const lastX = d.radiant_xp_adv?.length ? d.radiant_xp_adv[d.radiant_xp_adv.length - 1] : 0;
      records.push({
        id: m.match_id,
        t: m.start_time,
        rt: m.radiant_team_id!,
        dt: m.dire_team_id!,
        rw: m.radiant_win,
        rp: d.picks_bans.filter((p) => p.is_pick && p.team === 0).map((p) => p.hero_id),
        dp: d.picks_bans.filter((p) => p.is_pick && p.team === 1).map((p) => p.hero_id),
        lg: m.leagueid,
        st: m.series_type,
        sid: m.series_id,
        gx: lastG + lastX,
      });
    });
  }
  return records;
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('mode') ?? 'all';
  try {
    const storedIds = new Set(await getStoredIndex());
    const leagues = await od.leagues();
    let liveAdded = 0;
    let backfillAdded = 0;
    const detail: Record<string, unknown> = {};

    // ── 1. LIVE harvest ──
    if (mode === 'all' || mode === 'live') {
      const liveIds = buildTournamentPool(leagues, { count: 8 }).map((t) => t.id);
      const lists = await Promise.all(
        liveIds.map((id) => od.leagueMatches(id).catch(() => []))
      );
      const liveMatches = lists
        .flat()
        .filter((m) => m.radiant_team_id && m.dire_team_id);
      const records = await harvest(liveMatches, storedIds, MAX_NEW_DETAILS);
      liveAdded = await appendMatches(records);
      records.forEach((r) => storedIds.add(r.id));
      detail.liveProbed = liveMatches.length;
    }

    // ── 2. BACKFILL history (if under target) ──
    const sizeBefore = await datasetSize();
    if ((mode === 'all' || mode === 'backfill') && sizeBefore < TARGET_DATASET) {
      // Candidate past tournaments: only those with recognizable Tier-1 names
      // (DreamLeague, Wallachia, BLAST Slam, ESL One, etc). These are all modern
      // series, avoiding ancient 2012-era leagues that pollute the model.
      const pastPool = buildTournamentPool(leagues, { count: 200 })
        .filter((t) => TIER1_NAME_RE.test(t.name))
        .map((t) => t.id);
      const cursor = await getBackfillCursor();
      const slice = pastPool.slice(cursor, cursor + BACKFILL_TOURNAMENTS_PER_RUN);
      // wrap around
      const nextCursor =
        cursor + BACKFILL_TOURNAMENTS_PER_RUN >= pastPool.length
          ? 0
          : cursor + BACKFILL_TOURNAMENTS_PER_RUN;
      await setBackfillCursor(nextCursor);

      const lists = await Promise.all(
        slice.map((id) => od.leagueMatches(id).catch(() => []))
      );
      // Only keep reasonably recent matches — old patches are a different game
      // (different heroes/meta) and would poison a model predicting today's games.
      const RECENT_CUTOFF = Math.floor(Date.now() / 1000) - 540 * 24 * 60 * 60; // ~18 months
      const pastMatches = lists
        .flat()
        .filter((m) => m.radiant_team_id && m.dire_team_id)
        .filter((m) => m.start_time >= RECENT_CUTOFF);
      const records = await harvest(pastMatches, storedIds, MAX_NEW_DETAILS);
      backfillAdded = await appendMatches(records);
      detail.backfillCursor = cursor;
      detail.backfillNextCursor = nextCursor;
      detail.backfillTournaments = slice;
      detail.backfillProbed = pastMatches.length;
    }

    const total = await datasetSize();
    return NextResponse.json({
      ok: true,
      mode,
      liveAdded,
      backfillAdded,
      added: liveAdded + backfillAdded,
      datasetSize: total,
      target: TARGET_DATASET,
      ...detail,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

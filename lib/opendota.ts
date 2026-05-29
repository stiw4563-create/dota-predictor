// Tiny OpenDota client with fallback to mock data.
// In-memory TTL cache keeps us comfortably under the 60 req/min free-tier limit.
// Falls back to mocks if unreachable or NEXT_PUBLIC_USE_MOCK=true.

import {
  mockLeagues,
  mockMatches,
  mockLiveGames,
  mockMatchDetail,
  mockMatchDetailsList,
  mockHeroes,
  shouldUseMock,
} from './mock';

const BASE = 'https://api.opendota.com/api';

type CacheEntry<T> = { value: T; expires: number };
const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

interface FetchOpts {
  ttlSeconds?: number;
}

export async function odFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const ttl = opts.ttlSeconds ?? 300;
  const key = path;
  const now = Date.now();

  // If mock is forced, return immediately
  if (shouldUseMock()) {
    return getMockData(path) as Promise<T>;
  }

  const cached = cache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expires > now) return cached.value;

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const url = `${BASE}${path}`;
  const promise = (async () => {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'dota-predictor/0.2 (+https://github.com/)' },
      next: { revalidate: ttl },
    });
    if (!res.ok) {
      throw new Error(`OpenDota ${res.status} on ${path}`);
    }
    const data = (await res.json()) as T;
    cache.set(key, { value: data, expires: now + ttl * 1000 });
    return data;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise as Promise<unknown>);
  return promise;
}

function getMockData(path: string): unknown {
  if (path === '/leagues') return mockLeagues;
  if (path.match(/^\/leagues\/\d+\/matches/)) return mockMatches;
  if (path === '/live') return mockLiveGames;
  const matchMatch = path.match(/^\/matches\/(\d+)/);
  if (matchMatch) {
    const id = Number(matchMatch[1]);
    const found = mockMatchDetailsList.find((m) => m.match_id === id);
    return found ?? mockMatchDetail;
  }
  if (path === '/heroes') return mockHeroes;
  return [];
}

// ───────── Specific endpoints ─────────

import type {
  ODLeague,
  ODLeagueMatch,
  ODMatchDetail,
  ODLiveGame,
  ODHero,
} from './types';

export const od = {
  leagues: () => odFetch<ODLeague[]>('/leagues', { ttlSeconds: 60 * 60 }),
  leagueMatches: (id: number) =>
    odFetch<ODLeagueMatch[]>(`/leagues/${id}/matches`, { ttlSeconds: 60 * 5 }),
  match: (id: number) =>
    odFetch<ODMatchDetail>(`/matches/${id}`, { ttlSeconds: 60 * 60 }),
  live: () => odFetch<ODLiveGame[]>('/live', { ttlSeconds: 15 }),
  heroes: () => odFetch<ODHero[]>('/heroes', { ttlSeconds: 60 * 60 * 12 }),
  team: (id: number) =>
    odFetch<{ team_id: number; name: string; tag?: string }>(`/teams/${id}`, {
      ttlSeconds: 60 * 60,
    }),
  // Bulk team list - one call returns ~thousands of teams with names+tags.
  // We use this to resolve team_id → name since /leagues/{id}/matches omits names.
  teams: () =>
    odFetch<Array<{ team_id: number; name: string; tag: string; rating: number }>>(
      '/teams',
      { ttlSeconds: 60 * 60 * 6 }
    ),
  // Players on a team: gives account_id + games_played for the roster.
  teamPlayers: (teamId: number) =>
    odFetch<
      Array<{
        account_id: number;
        name: string | null;
        games_played: number;
        wins: number;
        is_current_team_member: boolean | null;
      }>
    >(`/teams/${teamId}/players`, { ttlSeconds: 60 * 60 * 6 }),
  // A player's hero stats: games + wins per hero, all-time.
  playerHeroes: (accountId: number) =>
    odFetch<
      Array<{ hero_id: number; games: number; win: number; last_played: number }>
    >(`/players/${accountId}/heroes`, { ttlSeconds: 60 * 60 * 6 }),
};

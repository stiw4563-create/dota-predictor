// Persistent key-value store via Upstash Redis (a.k.a. Vercel KV).
//
// Vercel injects connection env vars when you attach a KV/Upstash integration.
// We support both the Vercel KV names and the native Upstash names. If neither
// is present (e.g. local dev without KV), we silently fall back to an in-memory
// Map so nothing breaks — calibration just won't persist across cold starts.

import { Redis } from '@upstash/redis';

type Stored = string;

let client: Redis | null = null;
let triedInit = false;

function getClient(): Redis | null {
  if (triedInit) return client;
  triedInit = true;

  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.STORAGE_KV_REST_API_URL ||
    process.env.STORAGE_REST_API_URL ||
    process.env.KV_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.STORAGE_KV_REST_API_TOKEN ||
    process.env.STORAGE_REST_API_TOKEN;

  if (url && token) {
    try {
      client = new Redis({ url, token });
    } catch {
      client = null;
    }
  }
  return client;
}

// In-memory fallback
const memory = new Map<string, Stored>();

export async function kvGet<T>(key: string): Promise<T | null> {
  const c = getClient();
  if (c) {
    try {
      const v = await c.get<T>(key);
      return v ?? null;
    } catch {
      // fall through to memory
    }
  }
  const raw = memory.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  const c = getClient();
  if (c) {
    try {
      await c.set(key, value);
      return;
    } catch {
      // fall through to memory
    }
  }
  memory.set(key, JSON.stringify(value));
}

export function kvIsPersistent(): boolean {
  return getClient() !== null;
}

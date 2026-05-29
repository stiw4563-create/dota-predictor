// GET /api/kv-check - verify KV connectivity without leaking secrets.

import { NextResponse } from 'next/server';
import { kvSet, kvGet, kvIsPersistent } from '@/lib/kv';

export const dynamic = 'force-dynamic';

export async function GET() {
  const envPresent = {
    KV_REST_API_URL: !!process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN,
    UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
    STORAGE_KV_REST_API_URL: !!process.env.STORAGE_KV_REST_API_URL,
    STORAGE_REST_API_URL: !!process.env.STORAGE_REST_API_URL,
  };

  let roundTrip: string | null = null;
  let error: string | null = null;
  try {
    const probe = `ok-${Date.now()}`;
    await kvSet('kv-check:probe', probe);
    roundTrip = await kvGet<string>('kv-check:probe');
  } catch (e) {
    error = (e as Error).message;
  }

  return NextResponse.json({
    persistent: kvIsPersistent(),
    envPresent,
    roundTrip,
    roundTripOk: roundTrip?.startsWith('ok-') ?? false,
    error,
  });
}

import { NextResponse } from 'next/server';
import { od } from '@/lib/opendota';

export const revalidate = 43200;

export async function GET() {
  try {
    const heroes = await od.heroes();
    return NextResponse.json({ heroes });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

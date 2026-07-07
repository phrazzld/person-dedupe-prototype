import { NextResponse } from 'next/server';
import { getDb } from '@/lib/dedupe/db';
import { runScan } from '@/lib/dedupe/pipeline';

export async function POST() {
  const db = getDb();
  const result = await runScan(db);
  return NextResponse.json(result);
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/dedupe/db';
import { unmergePeople, MergeError } from '@/lib/dedupe/merge';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  try {
    unmergePeople(db, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof MergeError ? 400 : 500;
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status });
  }
}

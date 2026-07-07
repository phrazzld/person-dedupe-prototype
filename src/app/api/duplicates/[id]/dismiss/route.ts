import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/dedupe/db';
import { dismissCandidate } from '@/lib/dedupe/repo';

const BodySchema = z.object({ verdict: z.enum(['dismiss', 'not_duplicate']) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = BodySchema.parse(await req.json());
  const db = getDb();
  try {
    dismissCandidate(db, id, body.verdict);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

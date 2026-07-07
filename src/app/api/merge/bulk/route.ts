// POST /api/merge/bulk — see src/lib/dedupe/bulk.ts for the semantics
// (per-pair execution, per-pair failure reporting, full audit per merge).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/dedupe/db';
import { bulkMerge } from '@/lib/dedupe/bulk';

const BodySchema = z.object({
  candidate_ids: z.array(z.string()).min(1),
  actor: z.string().default('demo-operator'),
});

export async function POST(req: Request) {
  const body = BodySchema.parse(await req.json());
  const db = getDb();
  return NextResponse.json({ results: bulkMerge(db, body.candidate_ids, body.actor) });
}

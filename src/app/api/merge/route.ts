import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/dedupe/db';
import { mergePeople, MergeError } from '@/lib/dedupe/merge';

const FieldDecisionSchema = z.object({
  kept: z.enum(['primary', 'secondary']),
  primary_value: z.string().nullable(),
  secondary_value: z.string().nullable(),
});

const BodySchema = z.object({
  primaryId: z.string(),
  secondaryId: z.string(),
  candidateId: z.string().nullable().optional(),
  fieldDecisions: z.record(FieldDecisionSchema).default({}),
  actor: z.string().default('demo-operator'),
});

export async function POST(req: Request) {
  const body = BodySchema.parse(await req.json());
  const db = getDb();
  try {
    const result = mergePeople(db, body);
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof MergeError ? 400 : 500;
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status });
  }
}

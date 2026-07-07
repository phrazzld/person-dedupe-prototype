import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/dedupe/db';
import { checkSingleRecord } from '@/lib/dedupe/repo';

const DraftSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().nullable().optional().default(null),
  phone: z.string().nullable().optional().default(null),
  date_of_birth: z.string().nullable().optional().default(null),
  address_line: z.string().nullable().optional().default(null),
  city: z.string().nullable().optional().default(null),
  region: z.string().nullable().optional().default(null),
  postal_code: z.string().nullable().optional().default(null),
  license_plate: z.string().nullable().optional().default(null),
});

export async function POST(req: Request) {
  const draft = DraftSchema.parse(await req.json());
  const db = getDb();
  const matches = checkSingleRecord(db, draft);
  return NextResponse.json({
    matches: matches.map((m) => ({
      person: m.person,
      det_score: m.det_score,
      tier: m.tier,
      description: m.description,
    })),
  });
}

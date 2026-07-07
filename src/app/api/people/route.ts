import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/dedupe/db';
import { createPerson } from '@/lib/dedupe/repo';

const DraftSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
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
  const person = createPerson(db, draft);
  return NextResponse.json({ person });
}

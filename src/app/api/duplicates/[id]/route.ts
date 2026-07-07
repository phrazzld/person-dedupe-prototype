import { NextResponse } from 'next/server';
import { getDb } from '@/lib/dedupe/db';
import { getCandidateDetail, listBookings, confidenceOf, deriveFieldWeights } from '@/lib/dedupe/repo';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const detail = getCandidateDetail(db, id);
  if (!detail) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

  return NextResponse.json({
    id: detail.candidate.id,
    status: detail.candidate.status,
    det_score: detail.candidate.det_score,
    tier: detail.candidate.tier,
    llm: detail.candidate.llm,
    confidence: confidenceOf(detail.candidate),
    field_weights: deriveFieldWeights(detail.candidate),
    signals: detail.candidate.signals,
    person_a: detail.personA,
    person_b: detail.personB,
    bookings_a: listBookings(db, detail.personA.id),
    bookings_b: listBookings(db, detail.personB.id),
  });
}

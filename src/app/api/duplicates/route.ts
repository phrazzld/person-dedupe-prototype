import { NextResponse } from 'next/server';
import { getDb } from '@/lib/dedupe/db';
import { listOpenCandidates, confidenceOf } from '@/lib/dedupe/repo';

export async function GET() {
  const db = getDb();
  const open = listOpenCandidates(db);
  return NextResponse.json(
    open.map((item) => ({
      id: item.candidate.id,
      person_a: item.personA,
      person_b: item.personB,
      det_score: item.candidate.det_score,
      tier: item.candidate.tier,
      llm: item.candidate.llm,
      confidence: confidenceOf(item.candidate),
      signals: item.candidate.signals,
    })),
  );
}

import { notFound } from 'next/navigation';
import { getDb } from '@/lib/dedupe/db';
import { getCandidateDetail, listBookings, confidenceOf, deriveFieldWeights } from '@/lib/dedupe/repo';
import { MergeFlow } from './MergeFlow';

export const dynamic = 'force-dynamic';

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const detail = getCandidateDetail(db, id);
  if (!detail) notFound();

  const initial = {
    candidateId: detail.candidate.id,
    status: detail.candidate.status,
    confidence: confidenceOf(detail.candidate),
    fieldWeights: deriveFieldWeights(detail.candidate),
    llm: detail.candidate.llm,
    personA: detail.personA,
    personB: detail.personB,
    bookingsA: listBookings(db, detail.personA.id),
    bookingsB: listBookings(db, detail.personB.id),
  };

  return <MergeFlow initial={initial} />;
}

import Link from 'next/link';
import { getDb } from '@/lib/dedupe/db';
import { listOpenCandidates, confidenceOf, deriveFieldWeights } from '@/lib/dedupe/repo';
import { ConfidenceBadge, FieldChips } from '@/components/badges';
import { ScanButton } from './ScanButton';
import { RowActions } from './RowActions';
import type { CandidateWithPeople } from '@/lib/dedupe/repo';

export const dynamic = 'force-dynamic';

function nameOf(p: CandidateWithPeople['personA']): string {
  return `${p.first_name} ${p.last_name}`;
}

function Row({ item }: { item: CandidateWithPeople }) {
  const { candidate, personA, personB } = item;
  const confidence = confidenceOf(candidate);
  const weights = deriveFieldWeights(candidate);
  return (
    <tr>
      <td>
        <div className="pair-names">
          {nameOf(personA)}
          <span className="sep">/</span>
          {nameOf(personB)}
        </div>
        <div style={{ marginTop: 6 }}>
          <FieldChips fieldWeights={weights} />
        </div>
        {candidate.llm?.rationale && <div className="rationale">{candidate.llm.rationale}</div>}
      </td>
      <td>
        <ConfidenceBadge confidence={confidence} />
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
          <Link className="btn btn-primary btn-sm" href={`/duplicates/${candidate.id}`}>
            Review &amp; merge
          </Link>
          <RowActions candidateId={candidate.id} />
        </div>
      </td>
    </tr>
  );
}

export default function DuplicatesPage() {
  const db = getDb();
  const open = listOpenCandidates(db);

  const believedDistinct = open.filter((c) => c.candidate.llm?.verdict === 'distinct_people');
  const mainList = open.filter((c) => c.candidate.llm?.verdict !== 'distinct_people');

  return (
    <div>
      <div className="page-header toolbar">
        <div>
          <h1>Suggested Duplicates</h1>
          <p>Open candidate pairs, sorted by confidence. Detection ran via the deterministic scorer plus LLM adjudication on the ambiguous band.</p>
        </div>
        <ScanButton />
      </div>

      <div className="card">
        {mainList.length === 0 ? (
          <div className="empty-state">No open candidate pairs. Run a scan, or check back later.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Pair</th>
                <th>Confidence</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mainList.map((item) => (
                <Row key={item.candidate.id} item={item} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {believedDistinct.length > 0 && (
        <details className="collapsible-section">
          <summary className="collapsible-summary">Reviewed and believed distinct ({believedDistinct.length})</summary>
          <div className="card" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Confidence</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {believedDistinct.map((item) => (
                  <Row key={item.candidate.id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

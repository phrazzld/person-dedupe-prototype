import Link from 'next/link';
import { getDb } from '@/lib/dedupe/db';
import { listOpenCandidates, confidenceOf, deriveFieldWeights } from '@/lib/dedupe/repo';
import { ConfidenceBadge, FieldChips } from '@/components/badges';
import { ScanButton } from './ScanButton';
import { RowActions } from './RowActions';
import { BulkProvider, BulkSelectBox } from './BulkBar';
import type { CandidateWithPeople } from '@/lib/dedupe/repo';

export const dynamic = 'force-dynamic';

function nameOf(p: CandidateWithPeople['personA']): string {
  return `${p.first_name} ${p.last_name}`;
}

function Row({ item, selectable }: { item: CandidateWithPeople; selectable: boolean }) {
  const { candidate, personA, personB } = item;
  const confidence = confidenceOf(candidate);
  const weights = deriveFieldWeights(candidate);
  const pending = candidate.tier === 'ambiguous' && !candidate.llm;
  return (
    <tr>
      <td style={{ width: 28 }}>{selectable ? <BulkSelectBox candidateId={candidate.id} /> : null}</td>
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
        {pending && <div className="rationale">Adjudication pending — will score on the next scan.</div>}
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

function CandidateTable({ items, selectable }: { items: CandidateWithPeople[]; selectable: boolean }) {
  return (
    <table>
      <thead>
        <tr>
          <th style={{ width: 28 }} />
          <th>Pair</th>
          <th>Confidence</th>
          <th style={{ textAlign: 'right' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <Row key={item.candidate.id} item={item} selectable={selectable} />
        ))}
      </tbody>
    </table>
  );
}

export default function DuplicatesPage() {
  const db = getDb();
  const open = listOpenCandidates(db);

  const believedDistinct = open.filter((c) => c.candidate.llm?.verdict === 'distinct_people');
  const mainList = open.filter((c) => c.candidate.llm?.verdict !== 'distinct_people');

  const suggested = mainList.filter((c) => c.candidate.bucket === 'suggested');
  const review = mainList.filter((c) => c.candidate.bucket === 'review');
  const ignored = mainList.filter((c) => c.candidate.bucket === 'ignored');

  return (
    <div>
      <div className="page-header toolbar">
        <div>
          <h1>Suggested Duplicates</h1>
          <p>
            Open candidate pairs by confidence bucket. Detection ran via the deterministic scorer plus LLM adjudication
            on the ambiguous band.
          </p>
        </div>
        <ScanButton />
      </div>

      <BulkProvider suggestedIds={suggested.map((c) => c.candidate.id)}>
        <h2 className="bucket-heading">
          Suggested <span className="bucket-count">({suggested.length}) — confidence ≥ 90</span>
        </h2>
        <div className="card">
          {suggested.length === 0 ? (
            <div className="empty-state">No suggested pairs. Run a scan, or check back later.</div>
          ) : (
            <CandidateTable items={suggested} selectable />
          )}
        </div>

        {review.length > 0 && (
          <>
            <h2 className="bucket-heading">
              Needs review <span className="bucket-count">({review.length}) — confidence 60–89</span>
            </h2>
            <div className="card">
              <CandidateTable items={review} selectable={false} />
            </div>
          </>
        )}

        {ignored.length > 0 && (
          <details className="collapsible-section">
            <summary className="collapsible-summary">Low confidence ({ignored.length}) — below 60, auto-ignored</summary>
            <div className="card" style={{ marginTop: 8 }}>
              <CandidateTable items={ignored} selectable={false} />
            </div>
          </details>
        )}

        {believedDistinct.length > 0 && (
          <details className="collapsible-section">
            <summary className="collapsible-summary">Reviewed and believed distinct ({believedDistinct.length})</summary>
            <div className="card" style={{ marginTop: 8 }}>
              <CandidateTable items={believedDistinct} selectable={false} />
            </div>
          </details>
        )}
      </BulkProvider>
    </div>
  );
}

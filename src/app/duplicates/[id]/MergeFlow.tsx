'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ConfidenceBadge, FieldChips } from '@/components/badges';
import type { Person, Booking, LlmAdjudication } from '@/lib/dedupe/types';

const COMPARABLE_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'address_line',
  'city',
  'region',
  'postal_code',
  'license_plate',
] as const;

const FIELD_LABELS: Record<string, string> = {
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  address_line: 'Address',
  city: 'City',
  region: 'Region',
  postal_code: 'Postal code',
  license_plate: 'License plate',
};

interface Initial {
  candidateId: string;
  status: string;
  confidence: number;
  fieldWeights: Record<string, 'strong' | 'moderate' | 'weak' | 'counter'>;
  llm: LlmAdjudication | null;
  personA: Person;
  personB: Person;
  bookingsA: Booking[];
  bookingsB: Booking[];
}

type Step = 'compare' | 'conflicts' | 'preview' | 'verify';

function display(value: string | null): string {
  return value && value.length ? value : '—';
}

function fullName(p: Person): string {
  return `${p.first_name} ${p.last_name}`;
}

function bookingSummary(bookings: Booking[]): string {
  if (bookings.length === 0) return 'No bookings';
  const latest = [...bookings].sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0];
  return `${bookings.length} booking${bookings.length === 1 ? '' : 's'}, latest ${latest.start_date}`;
}

export function MergeFlow({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initial.status === 'merged' ? 'verify' : 'compare');
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, 'primary' | 'secondary'>>({});
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergeEventId, setMergeEventId] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ primary_before: number; secondary_before: number; after: number } | null>(null);
  const [unmerging, setUnmerging] = useState(false);
  const [unmerged, setUnmerged] = useState(false);

  const { personA, personB, bookingsA, bookingsB, fieldWeights, llm, confidence } = initial;

  const primary = primaryId === personA.id ? personA : primaryId === personB.id ? personB : null;
  const secondary = primary ? (primary.id === personA.id ? personB : personA) : null;
  const primaryBookings = primary ? (primary.id === personA.id ? bookingsA : bookingsB) : [];
  const secondaryBookings = secondary ? (secondary.id === personA.id ? bookingsA : bookingsB) : [];

  const conflicts = useMemo(() => {
    if (!primary || !secondary) return [];
    return COMPARABLE_FIELDS.filter((f) => (primary as any)[f] !== (secondary as any)[f]);
  }, [primary, secondary]);

  const notesDiffer = primary && secondary ? primary.notes !== secondary.notes : false;

  function decisionFor(field: string): 'primary' | 'secondary' {
    return decisions[field] ?? 'primary';
  }

  async function executeMerge() {
    if (!primary || !secondary) return;
    setMerging(true);
    setError(null);
    try {
      const fieldDecisions: Record<string, any> = {};
      for (const field of conflicts) {
        const kept = decisionFor(field);
        fieldDecisions[field] = {
          kept,
          primary_value: (primary as any)[field],
          secondary_value: (secondary as any)[field],
        };
      }
      const res = await fetch('/api/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryId: primary.id,
          secondaryId: secondary.id,
          candidateId: initial.candidateId,
          fieldDecisions,
          actor: 'demo-operator',
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Merge failed');
      setMergeEventId(body.mergeEventId);
      setCounts(body.counts.bookings);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMerging(false);
    }
  }

  async function executeUnmerge() {
    if (!mergeEventId) return;
    setUnmerging(true);
    setError(null);
    try {
      const res = await fetch(`/api/merges/${mergeEventId}/unmerge`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Unmerge failed');
      setUnmerged(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUnmerging(false);
    }
  }

  const steps: Step[] = ['compare', 'conflicts', 'preview', 'verify'];
  const stepIndex = steps.indexOf(step);

  return (
    <div>
      <div className="page-header">
        <p style={{ marginBottom: 6 }}>
          <Link href="/duplicates">&larr; Back to duplicates</Link>
        </p>
        <h1>
          {fullName(personA)} <span style={{ color: 'var(--text-faint)' }}>/</span> {fullName(personB)}
        </h1>
        <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
          <ConfidenceBadge confidence={confidence} />
          <FieldChips fieldWeights={fieldWeights} />
        </div>
        {llm?.rationale && <p style={{ marginTop: 6 }}>{llm.rationale}</p>}
      </div>

      {initial.status !== 'merged' && (
        <div className="step-indicator">
          {steps.map((s, i) => (
            <div key={s} className={`step-dot ${i === stepIndex ? 'active' : i < stepIndex ? 'done' : ''}`} />
          ))}
        </div>
      )}

      {error && (
        <div className="warning-panel" style={{ background: 'var(--danger-soft)', borderColor: '#f3b7ae', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {step === 'compare' && (
        <>
          <div className="compare-grid">
            {[personA, personB].map((p, idx) => {
              const bookings = idx === 0 ? bookingsA : bookingsB;
              return (
                <div className="compare-col" key={p.id}>
                  <div className="compare-col-header">
                    <strong>{fullName(p)}</strong>
                  </div>
                  {COMPARABLE_FIELDS.map((field) => (
                    <div className="compare-field" key={field}>
                      <div className="compare-field-label">{FIELD_LABELS[field]}</div>
                      <div className={`compare-field-value${(p as any)[field] ? '' : ' empty'}`}>
                        {display((p as any)[field])}
                      </div>
                    </div>
                  ))}
                  <div className="compare-field">
                    <div className="compare-field-label">Bookings</div>
                    <div className="compare-field-value">{bookingSummary(bookings)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card" style={{ marginTop: 20, padding: 20 }}>
            <div className="step-label">Choose primary</div>
            <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13.5 }}>
              The primary survives; the secondary is archived into it. No default — pick one.
            </p>
            {[personA, personB].map((p) => (
              <label key={p.id} className={`radio-row${primaryId === p.id ? ' selected' : ''}`}>
                <input type="radio" name="primary" checked={primaryId === p.id} onChange={() => setPrimaryId(p.id)} />
                <span>{fullName(p)} survives</span>
              </label>
            ))}
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" disabled={!primaryId} onClick={() => setStep('conflicts')}>
                Next: resolve conflicts
              </button>
            </div>
          </div>
        </>
      )}

      {step === 'conflicts' && primary && secondary && (
        <div className="card" style={{ padding: 20 }}>
          <div className="step-label">Resolve conflicts</div>
          <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13.5 }}>
            Every field where the two records disagree is shown below. Defaults to {fullName(primary)}&rsquo;s value —
            flip any of them.
          </p>
          {conflicts.length === 0 && <p style={{ fontSize: 13.5 }}>No conflicting fields — every shared field already agrees.</p>}
          {conflicts.map((field) => (
            <div className="conflict-row" key={field}>
              <div className="conflict-field-name">{FIELD_LABELS[field]}</div>
              <div
                className={`conflict-option${decisionFor(field) === 'primary' ? ' selected' : ''}`}
                onClick={() => setDecisions((d) => ({ ...d, [field]: 'primary' }))}
              >
                <div className="conflict-option-label">Primary ({fullName(primary)})</div>
                {display((primary as any)[field])}
              </div>
              <div
                className={`conflict-option${decisionFor(field) === 'secondary' ? ' selected' : ''}`}
                onClick={() => setDecisions((d) => ({ ...d, [field]: 'secondary' }))}
              >
                <div className="conflict-option-label">Secondary ({fullName(secondary)})</div>
                {display((secondary as any)[field])}
              </div>
            </div>
          ))}
          {notesDiffer && (
            <div className="unsupported-note">
              Notes differ between the two records — kept from primary. Merging free-text fields isn&rsquo;t supported.
            </div>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setStep('compare')}>
              Back
            </button>
            <button className="btn btn-primary" onClick={() => setStep('preview')}>
              Next: preview
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && primary && secondary && (
        <div className="card" style={{ padding: 20 }}>
          <div className="step-label">Preview</div>
          <p style={{ marginTop: 0, fontSize: 14 }}>Here&rsquo;s exactly what will happen when you confirm:</p>
          <div className="preview-box">
            <strong>
              {secondaryBookings.length} booking{secondaryBookings.length === 1 ? '' : 's'} will move from{' '}
              {fullName(secondary)} to {fullName(primary)}:
            </strong>
            <ul>
              {secondaryBookings.length === 0 && <li>No bookings to move.</li>}
              {secondaryBookings.map((b) => (
                <li key={b.id}>
                  {b.site}, {b.start_date} &ndash; {b.end_date} ({b.status})
                </li>
              ))}
            </ul>
          </div>
          <div className="preview-box">
            <strong>Field values that will change on {fullName(primary)}:</strong>
            <ul>
              {conflicts.filter((f) => decisionFor(f) === 'secondary').length === 0 && (
                <li>None — every field keeps the primary&rsquo;s current value.</li>
              )}
              {conflicts
                .filter((f) => decisionFor(f) === 'secondary')
                .map((f) => (
                  <li key={f}>
                    {FIELD_LABELS[f]}: {display((primary as any)[f])} &rarr; {display((secondary as any)[f])}
                  </li>
                ))}
            </ul>
          </div>
          <div className="preview-box">
            {fullName(secondary)} becomes an archived profile referencing {fullName(primary)}. This action is recorded
            in the audit log and can be reversed with Unmerge.
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setStep('conflicts')} disabled={merging}>
              Back
            </button>
            <button className="btn btn-primary" onClick={executeMerge} disabled={merging}>
              {merging ? 'Merging…' : `Merge ${fullName(secondary)} into ${fullName(primary)}`}
            </button>
          </div>
        </div>
      )}

      {step === 'verify' && (
        <div className="verify-panel">
          {unmerged ? (
            <>
              <strong>Unmerged.</strong> Both records are restored to their pre-merge state, and the candidate pair is
              open again.
              <div style={{ marginTop: 12 }}>
                <Link className="btn btn-sm" href="/duplicates">
                  Back to duplicates
                </Link>
              </div>
            </>
          ) : (
            <>
              <strong>Merge complete.</strong>
              {counts && (
                <div className="count-check" style={{ marginTop: 10 }}>
                  bookings: {counts.primary_before} + {counts.secondary_before} &rarr; {counts.after}{' '}
                  {counts.after === counts.primary_before + counts.secondary_before ? '✓' : '✗'}
                </div>
              )}
              <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                {mergeEventId && (
                  <Link className="btn btn-sm" href={`/merges#${mergeEventId}`}>
                    View audit event
                  </Link>
                )}
                {mergeEventId && (
                  <button className="btn btn-sm btn-danger" onClick={executeUnmerge} disabled={unmerging}>
                    {unmerging ? 'Unmerging…' : 'Unmerge'}
                  </button>
                )}
                {!mergeEventId && initial.status === 'merged' && (
                  <Link className="btn btn-sm" href="/merges">
                    View in audit log
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

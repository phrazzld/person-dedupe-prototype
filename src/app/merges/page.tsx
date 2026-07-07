import { getDb } from '@/lib/dedupe/db';
import { listMergeEvents } from '@/lib/dedupe/repo';
import { StatusPill } from '@/components/badges';
import { UnmergeButton } from './UnmergeButton';
import type { Person } from '@/lib/dedupe/types';

export const dynamic = 'force-dynamic';

function personName(id: string, db: ReturnType<typeof getDb>): string {
  const row = db.prepare('SELECT first_name, last_name FROM people WHERE id = ?').get(id) as Person | undefined;
  return row ? `${row.first_name} ${row.last_name}` : id;
}

export default function MergesPage() {
  const db = getDb();
  const events = listMergeEvents(db);

  return (
    <div>
      <div className="page-header">
        <h1>Merge Audit Log</h1>
        <p>Every merge, who did it, what moved, and whether it&rsquo;s been reversed. Every event expands to its full snapshot.</p>
      </div>

      {events.length === 0 ? (
        <div className="card">
          <div className="empty-state">No merges yet.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map((event) => {
            const primaryName = personName(event.primary_id, db);
            const secondaryName = personName(event.secondary_id, db);
            const changedFields = Object.entries(event.field_decisions).filter(([, d]) => d.kept === 'secondary');
            return (
              <details className="card" id={event.id} key={event.id} style={{ padding: 0 }} open={false}>
                <summary className="collapsible-summary" style={{ padding: '14px 20px' }}>
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <strong>
                      {secondaryName} &rarr; {primaryName}
                    </strong>
                    <span style={{ color: 'var(--text-faint)', fontSize: 12.5 }}>{new Date(event.created_at).toLocaleString()}</span>
                    <StatusPill tone={event.reversed_at ? 'reversed' : 'active'}>
                      {event.reversed_at ? 'Reversed' : 'Active'}
                    </StatusPill>
                    <span style={{ color: 'var(--text-faint)', fontSize: 12.5 }}>by {event.actor}</span>
                  </span>
                  {!event.reversed_at && (
                    <span onClick={(e) => e.stopPropagation()}>
                      <UnmergeButton mergeEventId={event.id} />
                    </span>
                  )}
                </summary>
                <div style={{ padding: '0 20px 20px' }}>
                  <p style={{ fontSize: 13.5 }}>
                    <strong>Bookings:</strong> {event.counts.bookings.primary_before} +{' '}
                    {event.counts.bookings.secondary_before} &rarr; {event.counts.bookings.after}{' '}
                    {event.counts.bookings.after === event.counts.bookings.primary_before + event.counts.bookings.secondary_before
                      ? '✓'
                      : '✗'}
                  </p>
                  <p style={{ fontSize: 13.5 }}>
                    <strong>Moved bookings:</strong>{' '}
                    {event.moved_children.bookings.length === 0 ? 'none' : event.moved_children.bookings.join(', ')}
                  </p>
                  <p style={{ fontSize: 13.5 }}>
                    <strong>Field decisions:</strong>{' '}
                    {changedFields.length === 0
                      ? 'no fields changed on the primary'
                      : changedFields.map(([field]) => field).join(', ') + ' taken from secondary'}
                  </p>
                  <div className="step-label" style={{ marginTop: 14 }}>
                    Full snapshot (pre-merge)
                  </div>
                  <pre className="snapshot-json">{JSON.stringify(event.snapshot_before, null, 2)}</pre>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

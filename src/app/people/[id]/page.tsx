import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/dedupe/db';
import { getPersonDetail, listBookings, resolveActivePerson } from '@/lib/dedupe/repo';

export const dynamic = 'force-dynamic';

export default async function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const detail = getPersonDetail(db, id);
  if (!detail) notFound();

  const { person, openCandidateId } = detail;
  const bookings = listBookings(db, person.id);
  const resolvedTo = person.status === 'merged' ? resolveActivePerson(db, person.id) : null;

  return (
    <div>
      <div className="page-header">
        <p style={{ marginBottom: 6 }}>
          <Link href="/people">&larr; Back to people</Link>
        </p>
        <h1>
          {person.first_name} {person.last_name}
        </h1>
        {person.status === 'merged' && resolvedTo && (
          <p style={{ color: 'var(--conf-warm)' }}>
            Merged on {person.updated_at.slice(0, 10)} into{' '}
            <Link href={`/people/${resolvedTo.id}`}>
              {resolvedTo.first_name} {resolvedTo.last_name}
            </Link>
            .
          </p>
        )}
        {openCandidateId && (
          <div className="warning-panel" style={{ marginTop: 12 }}>
            Possible duplicate — this person appears in an open candidate pair.{' '}
            <Link href={`/duplicates/${openCandidateId}`}>Review it</Link>.
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div className="compare-field">
          <div className="compare-field-label">Email</div>
          <div className="compare-field-value">{person.email ?? '—'}</div>
        </div>
        <div className="compare-field">
          <div className="compare-field-label">Phone</div>
          <div className="compare-field-value">{person.phone ?? '—'}</div>
        </div>
        {person.date_of_birth && (
          <div className="compare-field">
            <div className="compare-field-label">Date of birth</div>
            <div className="compare-field-value">{person.date_of_birth}</div>
          </div>
        )}
        <div className="compare-field">
          <div className="compare-field-label">Address</div>
          <div className="compare-field-value">
            {person.address_line ?? '—'}
            {person.city ? `, ${person.city}` : ''}
            {person.region ? `, ${person.region}` : ''} {person.postal_code ?? ''}
          </div>
        </div>
        {person.license_plate && (
          <div className="compare-field">
            <div className="compare-field-label">License plate</div>
            <div className="compare-field-value">{person.license_plate}</div>
          </div>
        )}
        {person.notes && (
          <div className="compare-field">
            <div className="compare-field-label">Notes</div>
            <div className="compare-field-value">{person.notes}</div>
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Bookings ({bookings.length})</h2>
      <div className="card">
        {bookings.length === 0 ? (
          <div className="empty-state">No bookings.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Site</th>
                <th>Dates</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.site}</td>
                  <td>
                    {b.start_date} &ndash; {b.end_date}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{b.status}</td>
                  <td>${(b.total_cents / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

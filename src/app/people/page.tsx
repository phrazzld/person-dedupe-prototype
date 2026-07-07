import Link from 'next/link';
import { getDb } from '@/lib/dedupe/db';
import { listPeople } from '@/lib/dedupe/repo';

export const dynamic = 'force-dynamic';

export default function PeoplePage() {
  const db = getDb();
  const people = listPeople(db);

  return (
    <div>
      <div className="page-header toolbar">
        <div>
          <h1>People</h1>
          <p>{people.length} active profiles.</p>
        </div>
        <Link className="btn btn-primary" href="/people/new">
          New person
        </Link>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Bookings</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {people.map(({ person, bookingCount, openCandidateId }) => (
              <tr key={person.id}>
                <td>
                  <Link href={`/people/${person.id}`}>
                    {person.first_name} {person.last_name}
                  </Link>
                  {openCandidateId && (
                    <Link href={`/duplicates/${openCandidateId}`} className="status-pill" style={{ marginLeft: 8, background: 'var(--conf-warm-bg)', color: 'var(--conf-warm)' }}>
                      Possible duplicate
                    </Link>
                  )}
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{person.email ?? '—'}</td>
                <td style={{ color: 'var(--text-muted)' }}>{bookingCount}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

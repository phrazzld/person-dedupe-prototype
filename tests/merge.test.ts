import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '@/lib/dedupe/db';
import { mergePeople, unmergePeople, resolveActivePerson, assertCountConserved, MergeError } from '@/lib/dedupe/merge';
import type { FieldDecision } from '@/lib/dedupe/types';

let db: Database.Database;

function insertPerson(id: string, overrides: Partial<Record<string, string | null>> = {}) {
  const defaults = {
    first_name: 'Test',
    last_name: 'Person',
    email: null,
    phone: null,
    address_line: null,
    city: null,
    region: null,
    postal_code: null,
    license_plate: null,
    notes: null,
  };
  const p = { ...defaults, ...overrides };
  db.prepare(
    `INSERT INTO people (id, first_name, last_name, email, phone, address_line, city, region, postal_code, license_plate, notes, status, merged_into, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(id, p.first_name, p.last_name, p.email, p.phone, p.address_line, p.city, p.region, p.postal_code, p.license_plate, p.notes);
}

function insertBooking(id: string, personId: string) {
  db.prepare(
    `INSERT INTO bookings (id, person_id, site, start_date, end_date, total_cents, status, created_at)
     VALUES (?, ?, 'Site 1', '2026-01-01', '2026-01-02', 10000, 'completed', '2026-01-01T00:00:00.000Z')`,
  ).run(id, personId);
}

function insertCandidate(id: string, aId: string, bId: string) {
  db.prepare(
    `INSERT INTO duplicate_candidates (id, person_a_id, person_b_id, blocking_rules, signals, det_score, tier, llm, bucket, status, created_at, updated_at)
     VALUES (?, ?, ?, '[]', '[]', 0.5, 'ambiguous', NULL, 'review', 'open', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(id, aId, bId);
}

function getPersonRow(id: string) {
  return db.prepare('SELECT * FROM people WHERE id = ?').get(id) as any;
}

function bookingIdsFor(personId: string): string[] {
  return (db.prepare('SELECT id FROM bookings WHERE person_id = ? ORDER BY id').all(personId) as { id: string }[]).map(
    (r) => r.id,
  );
}

beforeEach(() => {
  db = createTestDb();
});

describe('assertCountConserved', () => {
  it('passes when counts match', () => {
    expect(() => assertCountConserved(5, 5)).not.toThrow();
  });
  it('throws a MergeError when counts mismatch', () => {
    expect(() => assertCountConserved(5, 4)).toThrow(MergeError);
  });
});

describe('mergePeople', () => {
  it('re-parents all of the secondary\'s bookings onto the primary and conserves counts', () => {
    insertPerson('primary', { first_name: 'Robert', email: 'robert.chen@example.com', phone: '5554403000' });
    insertPerson('secondary', { first_name: 'Bob', email: 'bobchen99@mail.com', phone: '5554403000' });
    insertBooking('bk-p1', 'primary');
    insertBooking('bk-p2', 'primary');
    insertBooking('bk-s1', 'secondary');
    insertBooking('bk-s2', 'secondary');
    insertBooking('bk-s3', 'secondary');

    const result = mergePeople(db, {
      primaryId: 'primary',
      secondaryId: 'secondary',
      fieldDecisions: {},
      actor: 'test-operator',
    });

    expect(result.counts.bookings).toEqual({ primary_before: 2, secondary_before: 3, after: 5 });
    expect(bookingIdsFor('primary').sort()).toEqual(['bk-p1', 'bk-p2', 'bk-s1', 'bk-s2', 'bk-s3'].sort());
    expect(bookingIdsFor('secondary')).toEqual([]);

    const secondaryRow = getPersonRow('secondary');
    expect(secondaryRow.status).toBe('merged');
    expect(secondaryRow.merged_into).toBe('primary');
  });

  it('applies field decisions onto the primary and leaves unlisted fields untouched', () => {
    insertPerson('primary', { first_name: 'Robert', email: null, phone: '111' });
    insertPerson('secondary', { first_name: 'Bob', email: 'bobchen99@mail.com', phone: '222' });

    mergePeople(db, {
      primaryId: 'primary',
      secondaryId: 'secondary',
      fieldDecisions: {
        email: { kept: 'secondary', primary_value: null, secondary_value: 'bobchen99@mail.com' } as FieldDecision,
      },
      actor: 'test-operator',
    });

    const primaryRow = getPersonRow('primary');
    expect(primaryRow.email).toBe('bobchen99@mail.com'); // taken from secondary per decision
    expect(primaryRow.phone).toBe('111'); // untouched — no decision was made for this field
    expect(primaryRow.first_name).toBe('Robert'); // untouched
  });

  it('marks the candidate row merged when a candidateId is given', () => {
    insertPerson('primary');
    insertPerson('secondary');
    insertCandidate('cand-1', 'primary', 'secondary');

    mergePeople(db, { primaryId: 'primary', secondaryId: 'secondary', candidateId: 'cand-1', fieldDecisions: {}, actor: 'x' });

    const cand = db.prepare('SELECT status FROM duplicate_candidates WHERE id = ?').get('cand-1') as any;
    expect(cand.status).toBe('merged');
  });

  it('refuses to merge a person who is already merged (as primary)', () => {
    insertPerson('a');
    insertPerson('b');
    insertPerson('c');
    mergePeople(db, { primaryId: 'b', secondaryId: 'a', fieldDecisions: {}, actor: 'x' }); // a merges into b

    expect(() => mergePeople(db, { primaryId: 'a', secondaryId: 'c', fieldDecisions: {}, actor: 'x' })).toThrow(MergeError);
    // c must remain untouched since the transaction should have rolled back
    expect(getPersonRow('c').status).toBe('active');
  });

  it('refuses to merge a person who is already merged (as secondary) — no re-merge while merged', () => {
    insertPerson('a');
    insertPerson('b');
    insertPerson('c');
    mergePeople(db, { primaryId: 'b', secondaryId: 'a', fieldDecisions: {}, actor: 'x' }); // a merges into b

    expect(() => mergePeople(db, { primaryId: 'c', secondaryId: 'a', fieldDecisions: {}, actor: 'x' })).toThrow(MergeError);
  });

  it('rejects merging a person into themselves', () => {
    insertPerson('a');
    expect(() => mergePeople(db, { primaryId: 'a', secondaryId: 'a', fieldDecisions: {}, actor: 'x' })).toThrow(MergeError);
  });
});

describe('unmergePeople', () => {
  it('restores both person rows exactly and re-parents the originally-moved children back', () => {
    insertPerson('primary', { first_name: 'Robert', email: null, phone: '111' });
    insertPerson('secondary', { first_name: 'Bob', email: 'bobchen99@mail.com', phone: '222' });
    insertBooking('bk-p1', 'primary');
    insertBooking('bk-s1', 'secondary');
    insertBooking('bk-s2', 'secondary');

    const { mergeEventId } = mergePeople(db, {
      primaryId: 'primary',
      secondaryId: 'secondary',
      fieldDecisions: {
        email: { kept: 'secondary', primary_value: null, secondary_value: 'bobchen99@mail.com' } as FieldDecision,
      },
      actor: 'x',
    });

    // Simulate a booking created on the primary AFTER the merge — it must
    // stay on the primary through the unmerge, per spec.
    insertBooking('bk-p2-post-merge', 'primary');

    unmergePeople(db, mergeEventId);

    const primaryRow = getPersonRow('primary');
    expect(primaryRow.email).toBeNull(); // reverted
    expect(primaryRow.phone).toBe('111');

    const secondaryRow = getPersonRow('secondary');
    expect(secondaryRow.status).toBe('active');
    expect(secondaryRow.merged_into).toBeNull();
    expect(secondaryRow.email).toBe('bobchen99@mail.com');

    expect(bookingIdsFor('secondary').sort()).toEqual(['bk-s1', 'bk-s2']);
    expect(bookingIdsFor('primary')).toEqual(['bk-p1', 'bk-p2-post-merge']);
  });

  it('reopens the candidate pair on unmerge', () => {
    insertPerson('primary');
    insertPerson('secondary');
    insertCandidate('cand-1', 'primary', 'secondary');

    const { mergeEventId } = mergePeople(db, {
      primaryId: 'primary',
      secondaryId: 'secondary',
      candidateId: 'cand-1',
      fieldDecisions: {},
      actor: 'x',
    });
    unmergePeople(db, mergeEventId);

    const cand = db.prepare('SELECT status FROM duplicate_candidates WHERE id = ?').get('cand-1') as any;
    expect(cand.status).toBe('open');
  });

  it('refuses to reverse an already-reversed merge event', () => {
    insertPerson('primary');
    insertPerson('secondary');
    const { mergeEventId } = mergePeople(db, { primaryId: 'primary', secondaryId: 'secondary', fieldDecisions: {}, actor: 'x' });
    unmergePeople(db, mergeEventId);
    expect(() => unmergePeople(db, mergeEventId)).toThrow(MergeError);
  });

  it('allows a clean re-merge after unmerge', () => {
    insertPerson('primary');
    insertPerson('secondary');
    const { mergeEventId } = mergePeople(db, { primaryId: 'primary', secondaryId: 'secondary', fieldDecisions: {}, actor: 'x' });
    unmergePeople(db, mergeEventId);

    expect(() =>
      mergePeople(db, { primaryId: 'primary', secondaryId: 'secondary', fieldDecisions: {}, actor: 'x' }),
    ).not.toThrow();
  });
});

describe('three-way cluster interaction', () => {
  it('merging one pair does not corrupt the sibling candidate, and identity resolves through the chain', () => {
    // p1 <-> p2 <-> p3, exactly like seed case 8 (Elena Foster/Marsh/Marsh).
    insertPerson('p1', { first_name: 'Elena', last_name: 'Foster' });
    insertPerson('p2', { first_name: 'Elena', last_name: 'Marsh' });
    insertPerson('p3', { first_name: 'Elena', last_name: 'Marsh' });
    insertCandidate('cand-12', 'p1', 'p2');
    insertCandidate('cand-23', 'p2', 'p3');

    // Merge p1 into p2 (p2 survives as primary).
    mergePeople(db, { primaryId: 'p2', secondaryId: 'p1', candidateId: 'cand-12', fieldDecisions: {}, actor: 'x' });

    const cand12 = db.prepare('SELECT status FROM duplicate_candidates WHERE id = ?').get('cand-12') as any;
    const cand23 = db.prepare('SELECT status FROM duplicate_candidates WHERE id = ?').get('cand-23') as any;
    expect(cand12.status).toBe('merged');
    expect(cand23.status).toBe('open'); // untouched — sibling pair not corrupted

    expect(resolveActivePerson(db, 'p1').id).toBe('p2');
    // p2 is unaffected (still active, still the primary for cand-23).
    expect(resolveActivePerson(db, 'p2').id).toBe('p2');
  });

  it('when the shared person is merged away, the sibling pair resolves display to the new survivor', () => {
    insertPerson('p1', { first_name: 'Elena', last_name: 'Foster' });
    insertPerson('p2', { first_name: 'Elena', last_name: 'Marsh' });
    insertPerson('p3', { first_name: 'Elena', last_name: 'Marsh' });
    insertCandidate('cand-12', 'p1', 'p2');
    insertCandidate('cand-23', 'p2', 'p3');

    // This time merge p2 into p1 — p1 survives, p2 (the hub shared with
    // cand-23) is archived. cand-23's "p2" side must now resolve to p1.
    mergePeople(db, { primaryId: 'p1', secondaryId: 'p2', candidateId: 'cand-12', fieldDecisions: {}, actor: 'x' });

    expect(resolveActivePerson(db, 'p2').id).toBe('p1');

    const cand23 = db.prepare('SELECT person_a_id, person_b_id, status FROM duplicate_candidates WHERE id = ?').get('cand-23') as any;
    expect(cand23.status).toBe('open'); // still open, not silently dropped
    // The stored ids don't change, but resolving p2's side must land on p1.
    const resolvedSide = resolveActivePerson(db, cand23.person_a_id === 'p2' ? cand23.person_a_id : cand23.person_b_id);
    expect(resolvedSide.id).toBe('p1');
  });
});

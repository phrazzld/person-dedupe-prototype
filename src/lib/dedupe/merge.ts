// The merge/unmerge engine. Most port-critical file in the prototype: every
// invariant here is asserted in tests/merge.test.ts and must survive the
// port to the host app's real tables.

import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { Person, FieldDecision, MergeEvent, MergeCounts } from './types';
import { COMPARABLE_FIELDS } from './types';

export class MergeError extends Error {}

function nowIso(): string {
  return new Date().toISOString();
}

function getPerson(db: Database.Database, id: string): Person {
  const row = db.prepare('SELECT * FROM people WHERE id = ?').get(id) as Person | undefined;
  if (!row) throw new MergeError(`Person ${id} not found`);
  return row;
}

function countBookings(db: Database.Database, personId: string): number {
  const row = db.prepare('SELECT COUNT(*) as n FROM bookings WHERE person_id = ?').get(personId) as { n: number };
  return row.n;
}

/** Guards the count-conservation invariant. Extracted so it's independently testable. */
export function assertCountConserved(expected: number, actual: number, label = 'bookings'): void {
  if (actual !== expected) {
    throw new MergeError(`Count conservation violated for ${label}: expected ${expected}, got ${actual}`);
  }
}

export interface MergeInput {
  primaryId: string;
  secondaryId: string;
  candidateId?: string | null;
  /** Only fields where the operator explicitly chose 'secondary' need an entry; unlisted fields keep the primary's current value. */
  fieldDecisions: Record<string, FieldDecision>;
  actor: string;
}

export interface MergeResult {
  mergeEventId: string;
  counts: MergeCounts;
}

/**
 * Merges secondary into primary in a single transaction:
 * - applies field decisions onto primary
 * - re-parents all of secondary's bookings onto primary
 * - archives secondary (status='merged', merged_into=primary)
 * - records a full audit/snapshot row in merge_events
 * - asserts count conservation before committing; throws (aborting the
 *   transaction) on any mismatch
 */
export function mergePeople(db: Database.Database, input: MergeInput): MergeResult {
  const run = db.transaction((): MergeResult => {
    if (input.primaryId === input.secondaryId) {
      throw new MergeError('Cannot merge a person into themselves');
    }

    const primaryBefore = getPerson(db, input.primaryId);
    const secondaryBefore = getPerson(db, input.secondaryId);

    if (primaryBefore.status === 'merged') {
      throw new MergeError(`Person ${input.primaryId} is already merged and cannot be a merge target`);
    }
    if (secondaryBefore.status === 'merged') {
      throw new MergeError(`Person ${input.secondaryId} is already merged and cannot be merged again`);
    }

    const snapshot_before = { primary: primaryBefore, secondary: secondaryBefore };

    const primaryBookingsBefore = countBookings(db, input.primaryId);
    const secondaryBookingsBefore = countBookings(db, input.secondaryId);

    // Apply field decisions onto primary. Unlisted fields keep primary's
    // current value untouched — no silent smart-merging.
    const updates: Partial<Record<string, string | null>> = {};
    for (const field of COMPARABLE_FIELDS) {
      const decision = input.fieldDecisions[field];
      if (decision && decision.kept === 'secondary') {
        updates[field] = decision.secondary_value;
      }
    }

    if (Object.keys(updates).length > 0) {
      const setClause = Object.keys(updates).map((f) => `${f} = ?`).join(', ');
      const values = Object.keys(updates).map((f) => updates[f] ?? null);
      db.prepare(`UPDATE people SET ${setClause}, updated_at = ? WHERE id = ?`).run(...values, nowIso(), input.primaryId);
    }

    // Re-parent secondary's bookings onto primary, capturing exactly which
    // ids moved (needed verbatim for unmerge).
    const movedBookingRows = db
      .prepare('SELECT id FROM bookings WHERE person_id = ?')
      .all(input.secondaryId) as { id: string }[];
    const movedBookingIds = movedBookingRows.map((r) => r.id);

    db.prepare('UPDATE bookings SET person_id = ? WHERE person_id = ?').run(input.primaryId, input.secondaryId);

    // Archive secondary.
    db.prepare("UPDATE people SET status = 'merged', merged_into = ?, updated_at = ? WHERE id = ?").run(
      input.primaryId,
      nowIso(),
      input.secondaryId,
    );

    // Invariant: counts.after == primary_before + secondary_before.
    const bookingsAfter = countBookings(db, input.primaryId);
    assertCountConserved(primaryBookingsBefore + secondaryBookingsBefore, bookingsAfter, 'bookings');

    const counts: MergeCounts = {
      bookings: {
        primary_before: primaryBookingsBefore,
        secondary_before: secondaryBookingsBefore,
        after: bookingsAfter,
      },
    };

    if (input.candidateId) {
      db.prepare("UPDATE duplicate_candidates SET status = 'merged', updated_at = ? WHERE id = ?").run(
        nowIso(),
        input.candidateId,
      );
    }

    const mergeEventId = uuidv4();
    db.prepare(
      `INSERT INTO merge_events
        (id, primary_id, secondary_id, candidate_id, field_decisions, moved_children, snapshot_before, counts, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      mergeEventId,
      input.primaryId,
      input.secondaryId,
      input.candidateId ?? null,
      JSON.stringify(input.fieldDecisions),
      JSON.stringify({ bookings: movedBookingIds }),
      JSON.stringify(snapshot_before),
      JSON.stringify(counts),
      input.actor,
      nowIso(),
    );

    return { mergeEventId, counts };
  });

  return run();
}

function getMergeEventRow(db: Database.Database, mergeEventId: string): MergeEvent {
  const row = db.prepare('SELECT * FROM merge_events WHERE id = ?').get(mergeEventId) as
    | (Omit<MergeEvent, 'field_decisions' | 'moved_children' | 'snapshot_before' | 'counts'> & {
        field_decisions: string;
        moved_children: string;
        snapshot_before: string;
        counts: string;
      })
    | undefined;
  if (!row) throw new MergeError(`Merge event ${mergeEventId} not found`);
  return {
    ...row,
    field_decisions: JSON.parse(row.field_decisions),
    moved_children: JSON.parse(row.moved_children),
    snapshot_before: JSON.parse(row.snapshot_before),
    counts: JSON.parse(row.counts),
  };
}

/**
 * Reverses a merge: restores both person rows exactly from snapshot_before,
 * re-parents exactly the children listed in moved_children back to
 * secondary (children created on primary after the merge stay put), clears
 * the tombstone, and reopens the candidate pair.
 */
export function unmergePeople(db: Database.Database, mergeEventId: string): void {
  const run = db.transaction((): void => {
    const event = getMergeEventRow(db, mergeEventId);
    if (event.reversed_at) {
      throw new MergeError(`Merge event ${mergeEventId} was already reversed`);
    }

    const { primary, secondary } = event.snapshot_before;

    const restore = (person: Person) => {
      db.prepare(
        `UPDATE people SET
           first_name = ?, last_name = ?, email = ?, phone = ?, address_line = ?,
           city = ?, region = ?, postal_code = ?, license_plate = ?, notes = ?,
           status = ?, merged_into = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        person.first_name,
        person.last_name,
        person.email,
        person.phone,
        person.address_line,
        person.city,
        person.region,
        person.postal_code,
        person.license_plate,
        person.notes,
        person.status,
        person.merged_into,
        nowIso(),
        person.id,
      );
    };

    restore(primary);
    restore(secondary);

    const movedBookingIds = event.moved_children.bookings;
    if (movedBookingIds.length > 0) {
      const placeholders = movedBookingIds.map(() => '?').join(',');
      db.prepare(`UPDATE bookings SET person_id = ? WHERE id IN (${placeholders})`).run(secondary.id, ...movedBookingIds);
    }

    db.prepare('UPDATE merge_events SET reversed_at = ? WHERE id = ?').run(nowIso(), mergeEventId);

    if (event.candidate_id) {
      db.prepare("UPDATE duplicate_candidates SET status = 'open', updated_at = ? WHERE id = ?").run(
        nowIso(),
        event.candidate_id,
      );
    }
  });

  run();
}

/** Follows merged_into chains to find the currently-active record a person's identity resolves to. */
export function resolveActivePerson(db: Database.Database, personId: string): Person {
  let current = getPerson(db, personId);
  const seen = new Set<string>();
  while (current.status === 'merged' && current.merged_into && !seen.has(current.id)) {
    seen.add(current.id);
    current = getPerson(db, current.merged_into);
  }
  return current;
}

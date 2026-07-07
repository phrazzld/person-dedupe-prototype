// Bulk merge: each selected candidate pair merges individually through the
// same engine as single merges. One pair's failure never rolls back or
// blocks the rest; every success writes its own full audit event. Primary
// is the older record; survivorship uses the shared defaults.

import type Database from 'better-sqlite3';
import type { Person } from './types';
import { mergePeople } from './merge';
import { defaultFieldDecisions, olderPersonIsPrimary } from './survivorship';

export interface BulkMergeResult {
  candidate_id: string;
  ok: boolean;
  merged?: { primary: string; secondary: string; merge_event_id: string };
  error?: string;
}

function fullName(p: Person): string {
  return `${p.first_name} ${p.last_name}`;
}

export function bulkMerge(db: Database.Database, candidateIds: string[], actor: string): BulkMergeResult[] {
  const results: BulkMergeResult[] = [];
  for (const candidateId of candidateIds) {
    try {
      const row = db.prepare('SELECT * FROM duplicate_candidates WHERE id = ?').get(candidateId) as
        | { id: string; person_a_id: string; person_b_id: string; status: string }
        | undefined;
      if (!row) throw new Error('Candidate not found');
      if (row.status !== 'open') throw new Error(`Candidate is ${row.status}, not open`);

      const personA = db.prepare('SELECT * FROM people WHERE id = ?').get(row.person_a_id) as Person;
      const personB = db.prepare('SELECT * FROM people WHERE id = ?').get(row.person_b_id) as Person;

      const { primary, secondary } = olderPersonIsPrimary(personA, personB);
      const { mergeEventId } = mergePeople(db, {
        primaryId: primary.id,
        secondaryId: secondary.id,
        candidateId,
        fieldDecisions: defaultFieldDecisions(primary, secondary),
        actor,
      });
      results.push({
        candidate_id: candidateId,
        ok: true,
        merged: { primary: fullName(primary), secondary: fullName(secondary), merge_event_id: mergeEventId },
      });
    } catch (err) {
      results.push({ candidate_id: candidateId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

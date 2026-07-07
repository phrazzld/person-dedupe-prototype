// Thin read/write layer over better-sqlite3 for the app's pages and API
// routes. Not part of the port-critical core (that's normalize/candidates/
// score/adjudicate/merge) — this is Next.js-facing plumbing.

import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { Person, Booking, DuplicateCandidate, MergeEvent, Signal, LlmAdjudication, BlockingRule } from './types';
import { resolveActivePerson } from './merge';
import { effectiveConfidence } from './score';
import { checkSingleRecord, type PersonDraft, type SingleCheckMatch } from './pipeline';

function nowIso(): string {
  return new Date().toISOString();
}

function parseCandidateRow(row: any): DuplicateCandidate {
  return {
    ...row,
    blocking_rules: JSON.parse(row.blocking_rules ?? '[]') as BlockingRule[],
    signals: JSON.parse(row.signals) as Signal[],
    llm: row.llm ? (JSON.parse(row.llm) as LlmAdjudication) : null,
  };
}

export interface CandidateWithPeople {
  candidate: DuplicateCandidate;
  personA: Person;
  personB: Person;
  bookingCountA: number;
  bookingCountB: number;
}

function bookingCount(db: Database.Database, personId: string): number {
  const row = db.prepare('SELECT COUNT(*) as n FROM bookings WHERE person_id = ?').get(personId) as { n: number };
  return row.n;
}

function getPerson(db: Database.Database, id: string): Person {
  const row = db.prepare('SELECT * FROM people WHERE id = ?').get(id) as Person | undefined;
  if (!row) throw new Error(`Person ${id} not found`);
  return row;
}

function hydrate(db: Database.Database, row: any): CandidateWithPeople {
  const candidate = parseCandidateRow(row);
  const personA = getPerson(db, candidate.person_a_id);
  const personB = getPerson(db, candidate.person_b_id);
  return {
    candidate,
    personA,
    personB,
    bookingCountA: bookingCount(db, personA.id),
    bookingCountB: bookingCount(db, personB.id),
  };
}

/** Open candidates, confidence descending — the /duplicates report's primary list. */
export function listOpenCandidates(db: Database.Database): CandidateWithPeople[] {
  const rows = db.prepare("SELECT * FROM duplicate_candidates WHERE status = 'open'").all();
  return rows.map((r) => hydrate(db, r)).sort((a, b) => confidenceOf(b.candidate) - confidenceOf(a.candidate));
}

export function confidenceOf(candidate: DuplicateCandidate): number {
  return effectiveConfidence(candidate);
}

export function getCandidateDetail(db: Database.Database, id: string): CandidateWithPeople | null {
  const row = db.prepare('SELECT * FROM duplicate_candidates WHERE id = ?').get(id);
  if (!row) return null;
  return hydrate(db, row);
}

export function listBookings(db: Database.Database, personId: string): Booking[] {
  return db.prepare('SELECT * FROM bookings WHERE person_id = ? ORDER BY start_date DESC').all(personId) as Booking[];
}

export function dismissCandidate(db: Database.Database, id: string, verdict: 'dismiss' | 'not_duplicate'): void {
  const row = db.prepare('SELECT * FROM duplicate_candidates WHERE id = ?').get(id) as any;
  if (!row) throw new Error(`Candidate ${id} not found`);

  if (verdict === 'not_duplicate') {
    const existingLlm: LlmAdjudication | null = row.llm ? JSON.parse(row.llm) : null;
    const llm: LlmAdjudication = {
      confidence: existingLlm?.verdict === 'distinct_people' ? existingLlm.confidence : 0,
      verdict: 'distinct_people',
      distinct_hypothesis: existingLlm?.distinct_hypothesis ?? null,
      field_weights: existingLlm?.field_weights ?? {},
      rationale: existingLlm?.rationale ?? 'Marked not-duplicate by operator.',
      model_version: 'operator',
      scored_at: nowIso(),
    };
    db.prepare("UPDATE duplicate_candidates SET status = 'dismissed', llm = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(llm),
      nowIso(),
      id,
    );
  } else {
    db.prepare("UPDATE duplicate_candidates SET status = 'dismissed', updated_at = ? WHERE id = ?").run(nowIso(), id);
  }
}

export function listMergeEvents(db: Database.Database): MergeEvent[] {
  const rows = db.prepare('SELECT * FROM merge_events ORDER BY created_at DESC').all() as any[];
  return rows.map((row) => ({
    ...row,
    field_decisions: JSON.parse(row.field_decisions),
    moved_children: JSON.parse(row.moved_children),
    snapshot_before: JSON.parse(row.snapshot_before),
    counts: JSON.parse(row.counts),
  }));
}

export function getMergeEvent(db: Database.Database, id: string): MergeEvent | null {
  const row = db.prepare('SELECT * FROM merge_events WHERE id = ?').get(id) as any;
  if (!row) return null;
  return {
    ...row,
    field_decisions: JSON.parse(row.field_decisions),
    moved_children: JSON.parse(row.moved_children),
    snapshot_before: JSON.parse(row.snapshot_before),
    counts: JSON.parse(row.counts),
  };
}

export interface PersonListItem {
  person: Person;
  bookingCount: number;
  openCandidateId: string | null;
}

export function listPeople(db: Database.Database): PersonListItem[] {
  const people = db.prepare("SELECT * FROM people WHERE status = 'active' ORDER BY last_name, first_name").all() as Person[];
  const openCandidates = db.prepare("SELECT id, person_a_id, person_b_id FROM duplicate_candidates WHERE status = 'open'").all() as {
    id: string;
    person_a_id: string;
    person_b_id: string;
  }[];
  const openByPerson = new Map<string, string>();
  for (const c of openCandidates) {
    openByPerson.set(c.person_a_id, c.id);
    openByPerson.set(c.person_b_id, c.id);
  }
  return people.map((person) => ({
    person,
    bookingCount: bookingCount(db, person.id),
    openCandidateId: openByPerson.get(person.id) ?? null,
  }));
}

export function getPersonDetail(db: Database.Database, id: string): PersonListItem | null {
  const row = db.prepare('SELECT * FROM people WHERE id = ?').get(id) as Person | undefined;
  if (!row) return null;
  const openCandidates = db
    .prepare("SELECT id FROM duplicate_candidates WHERE status = 'open' AND (person_a_id = ? OR person_b_id = ?)")
    .all(id, id) as { id: string }[];
  return { person: row, bookingCount: bookingCount(db, id), openCandidateId: openCandidates[0]?.id ?? null };
}

export function createPerson(db: Database.Database, draft: PersonDraft): Person {
  const id = uuidv4();
  const now = nowIso();
  db.prepare(
    `INSERT INTO people (id, first_name, last_name, email, phone, date_of_birth, address_line, city, region, postal_code, license_plate, notes, status, merged_into, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'active', NULL, ?, ?)`,
  ).run(
    id,
    draft.first_name,
    draft.last_name,
    draft.email,
    draft.phone,
    draft.date_of_birth ?? null,
    draft.address_line,
    draft.city,
    draft.region,
    draft.postal_code,
    draft.license_plate,
    now,
    now,
  );
  return getPerson(db, id);
}

/**
 * Per-field weight for UI highlighting: the LLM's field_weights when
 * present (that's what it's for), else derived from the deterministic
 * signal kind for certain-tier pairs that skipped adjudication.
 */
export function deriveFieldWeights(candidate: DuplicateCandidate): Record<string, 'strong' | 'moderate' | 'weak' | 'counter'> {
  if (candidate.llm) return candidate.llm.field_weights;
  const weights: Record<string, 'strong' | 'moderate' | 'weak' | 'counter'> = {};
  for (const s of candidate.signals) {
    if (s.kind === 'conflict') weights[s.field] = 'counter';
    else if (s.kind === 'exact') weights[s.field] = 'strong';
    else if (s.kind === 'fuzzy') weights[s.field] = 'moderate';
    else weights[s.field] = 'weak';
  }
  return weights;
}

export { resolveActivePerson, checkSingleRecord };
export type { PersonDraft, SingleCheckMatch };

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '@/lib/dedupe/db';
import { bulkMerge } from '@/lib/dedupe/bulk';

let db: Database.Database;

function insertPerson(id: string, createdAt: string, overrides: Partial<Record<string, string | null>> = {}) {
  const d = { first_name: 'F', last_name: 'L', email: null, phone: null };
  const p = { ...d, ...overrides };
  db.prepare(
    `INSERT INTO people (id, first_name, last_name, email, phone, date_of_birth, address_line, city, region, postal_code, license_plate, notes, status, merged_into, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'active', NULL, ?, ?)`,
  ).run(id, p.first_name, p.last_name, p.email, p.phone, createdAt, createdAt);
}

function insertCandidate(id: string, aId: string, bId: string, status = 'open') {
  db.prepare(
    `INSERT INTO duplicate_candidates (id, person_a_id, person_b_id, blocking_rules, signals, det_score, tier, llm, bucket, status, created_at, updated_at)
     VALUES (?, ?, ?, '[]', '[]', 0.95, 'certain', NULL, 'suggested', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(id, aId, bId, status);
}

beforeEach(() => {
  db = createTestDb();
});

describe('bulkMerge', () => {
  it('merges every open selected pair through the same engine, older record primary', () => {
    insertPerson('a1', '2025-01-01T00:00:00.000Z', { first_name: 'Older' });
    insertPerson('a2', '2026-01-01T00:00:00.000Z', { first_name: 'Newer' });
    insertPerson('b1', '2025-06-01T00:00:00.000Z');
    insertPerson('b2', '2026-06-01T00:00:00.000Z');
    insertCandidate('cand-a', 'a1', 'a2');
    insertCandidate('cand-b', 'b1', 'b2');

    const results = bulkMerge(db, ['cand-a', 'cand-b'], 'bulk-operator');

    expect(results.every((r) => r.ok)).toBe(true);
    // older record survives
    expect(results[0].merged!.primary).toBe('Older L');
    // both secondaries archived, both candidates merged, two audit events written
    expect((db.prepare("SELECT COUNT(*) n FROM people WHERE status = 'merged'").get() as any).n).toBe(2);
    expect((db.prepare("SELECT COUNT(*) n FROM duplicate_candidates WHERE status = 'merged'").get() as any).n).toBe(2);
    expect((db.prepare('SELECT COUNT(*) n FROM merge_events').get() as any).n).toBe(2);
  });

  it('reports a failing pair per-pair and still processes the rest (no batch rollback)', () => {
    insertPerson('good1', '2025-01-01T00:00:00.000Z');
    insertPerson('good2', '2026-01-01T00:00:00.000Z');
    insertCandidate('cand-good', 'good1', 'good2');
    // an already-dismissed candidate should fail its own line, not abort the batch
    insertPerson('bad1', '2025-01-01T00:00:00.000Z');
    insertPerson('bad2', '2026-01-01T00:00:00.000Z');
    insertCandidate('cand-bad', 'bad1', 'bad2', 'dismissed');

    const results = bulkMerge(db, ['cand-bad', 'cand-good'], 'op');

    const bad = results.find((r) => r.candidate_id === 'cand-bad')!;
    const good = results.find((r) => r.candidate_id === 'cand-good')!;
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/not open/i);
    expect(good.ok).toBe(true);
    // the good pair merged despite the bad one failing first
    expect((db.prepare("SELECT status FROM people WHERE id = 'good2'").get() as any).status).toBe('merged');
    // the bad pair's people are untouched
    expect((db.prepare("SELECT status FROM people WHERE id = 'bad2'").get() as any).status).toBe('active');
  });

  it('reports a missing candidate as a failure without throwing', () => {
    const results = bulkMerge(db, ['nope'], 'op');
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toMatch(/not found/i);
  });
});

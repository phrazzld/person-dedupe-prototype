import { describe, it, expect } from 'vitest';
import { adjudicateBatch } from '@/lib/dedupe/adjudicate';
import { canonicalPair } from '@/lib/dedupe/candidates';
import type { Person } from '@/lib/dedupe/types';

// These exercise the fixture path (no OPENROUTER_API_KEY). If a key is set in
// the ambient shell, skip — we don't want to bill a live call in unit tests.
const live = Boolean(process.env.OPENROUTER_API_KEY);
const d = live ? describe.skip : describe;

function person(id: string): Person {
  return {
    id,
    first_name: 'A',
    last_name: 'B',
    email: null,
    phone: null,
    date_of_birth: null,
    address_line: null,
    city: null,
    region: null,
    postal_code: null,
    license_plate: null,
    notes: null,
    status: 'active',
    merged_into: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

d('adjudicateBatch (fixture path)', () => {
  it('returns a recorded fixture stamped with model_version="fixture" and a scored_at', async () => {
    const pair = canonicalPair('case4-a', 'case4-b'); // has a fixture (the spouse case)
    const out = await adjudicateBatch([{ pair, personA: person('case4-a'), personB: person('case4-b'), signals: [] }]);
    const adj = out.get('case4-a::case4-b');
    expect(adj).toBeDefined();
    expect(adj!.verdict).toBe('distinct_people');
    expect(adj!.model_version).toBe('fixture');
    expect(typeof adj!.scored_at).toBe('string');
  });

  it('leaves an unrecorded pair UNSCORED — never invents a default adjudication', async () => {
    const pair = canonicalPair('no-such-a', 'no-such-b');
    const out = await adjudicateBatch([{ pair, personA: person('no-such-a'), personB: person('no-such-b'), signals: [] }]);
    // pair with no fixture is absent from the map -> the pipeline persists it
    // with llm=null (unscored-pending), rather than a fabricated verdict.
    expect(out.has('no-such-a::no-such-b')).toBe(false);
  });

  it('returns an empty map for an empty input without any model call', async () => {
    const out = await adjudicateBatch([]);
    expect(out.size).toBe(0);
  });
});

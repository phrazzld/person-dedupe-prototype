import { describe, it, expect } from 'vitest';
import { generateCandidatePairs, canonicalPair, pairKey } from '@/lib/dedupe/candidates';
import { PEOPLE } from '@/lib/dedupe/seedData';
import type { Person } from '@/lib/dedupe/types';

const people = PEOPLE as unknown as Person[];

describe('generateCandidatePairs (blocking)', () => {
  const candidates = generateCandidatePairs(people);
  const keys = new Set(candidates.map((c) => pairKey(c.pair)));
  const byKey = new Map(candidates.map((c) => [pairKey(c.pair), c]));

  const expectedPairs: [string, string][] = [
    ['case1-a', 'case1-b'],
    ['case2-a', 'case2-b'],
    ['case3-a', 'case3-b'],
    ['case4-a', 'case4-b'],
    ['case5-a', 'case5-b'],
    ['case6-a', 'case6-b'],
    ['case7-a', 'case7-b'],
    ['case8-a', 'case8-b'],
    ['case8-b', 'case8-c'],
  ];

  it('generates exactly the 9 expected candidate pairs from the seed dataset', () => {
    expect(keys.size).toBe(expectedPairs.length);
    for (const [a, b] of expectedPairs) {
      expect(keys.has(pairKey(canonicalPair(a, b)))).toBe(true);
    }
  });

  it('does NOT pair case8-a with case8-c directly (three-way cluster has exactly two edges)', () => {
    expect(keys.has(pairKey(canonicalPair('case8-a', 'case8-c')))).toBe(false);
  });

  it('never pairs filler records with anything', () => {
    for (const c of candidates) {
      expect(c.pair[0].startsWith('filler-')).toBe(false);
      expect(c.pair[1].startsWith('filler-')).toBe(false);
    }
  });

  it('canonically orders pairs regardless of input order', () => {
    const reversed = generateCandidatePairs([...people].reverse());
    const reversedKeys = new Set(reversed.map((c) => pairKey(c.pair)));
    expect(reversedKeys).toEqual(keys);
  });

  it('records which blocking rules fired per pair', () => {
    // spouse pair surfaces via the shared household email
    expect(byKey.get(pairKey(canonicalPair('case4-a', 'case4-b')))!.rules).toContain('email');
    // same name + same DOB fires the name_dob key (alias emails do NOT match on the email key)
    const case7 = byKey.get(pairKey(canonicalPair('case7-a', 'case7-b')))!;
    expect(case7.rules).toContain('name_dob');
    expect(case7.rules).toContain('full_name');
    expect(case7.rules).not.toContain('email');
    // nickname pair blocks on phone digits, not name
    expect(byKey.get(pairKey(canonicalPair('case3-a', 'case3-b')))!.rules).toContain('phone');
  });
});

import { describe, it, expect } from 'vitest';
import { generateCandidatePairs, canonicalPair, pairKey } from '@/lib/dedupe/candidates';
import { PEOPLE } from '@/lib/dedupe/seedData';
import type { Person } from '@/lib/dedupe/types';

const people = PEOPLE as unknown as Person[];

describe('generateCandidatePairs (blocking)', () => {
  const pairs = generateCandidatePairs(people);
  const keys = new Set(pairs.map(pairKey));

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
    for (const pair of pairs) {
      expect(pair[0].startsWith('filler-')).toBe(false);
      expect(pair[1].startsWith('filler-')).toBe(false);
    }
  });

  it('canonically orders pairs regardless of input order', () => {
    const reversed = generateCandidatePairs([...people].reverse());
    const reversedKeys = new Set(reversed.map(pairKey));
    expect(reversedKeys).toEqual(keys);
  });
});

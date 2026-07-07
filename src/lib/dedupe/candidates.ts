// Blocking + candidate pair generation. Never O(n^2) pairwise — a pair only
// becomes a candidate if it shares at least one blocking key.

import type { Person } from './types';
import {
  normalizeEmail,
  normalizePhone,
  normalizeLicensePlate,
  normalizePostalCode,
  normalizeName,
  normalizeFullName,
} from './normalize';

export type PersonPair = readonly [string, string];

/** Canonically orders a pair of person ids so (a,b) and (b,a) collapse to one key. */
export function canonicalPair(aId: string, bId: string): PersonPair {
  return aId < bId ? [aId, bId] : [bId, aId];
}

export function pairKey(pair: PersonPair): string {
  return `${pair[0]}::${pair[1]}`;
}

function blockingKeys(p: Person): string[] {
  const keys: string[] = [];

  const email = normalizeEmail(p.email);
  if (email) keys.push(`email:${email}`);

  const phone = normalizePhone(p.phone);
  if (phone) keys.push(`phone:${phone}`);

  const plate = normalizeLicensePlate(p.license_plate);
  if (plate) keys.push(`plate:${plate}`);

  const lastName = normalizeName(p.last_name);
  const postal = normalizePostalCode(p.postal_code);
  if (lastName && postal) keys.push(`lastpostal:${lastName}|${postal}`);

  const fullName = normalizeFullName(p.first_name, p.last_name);
  if (fullName) keys.push(`fullname:${fullName}`);

  return keys;
}

/**
 * Generates deduped, canonically-ordered candidate pairs from a set of
 * people via blocking-key union. Callers are responsible for filtering out
 * pairs that are already known (merged/dismissed/open) — this function is a
 * pure function over the people it's given.
 */
export function generateCandidatePairs(people: Person[]): PersonPair[] {
  const blocks = new Map<string, Set<string>>();

  for (const p of people) {
    for (const key of blockingKeys(p)) {
      let bucket = blocks.get(key);
      if (!bucket) {
        bucket = new Set();
        blocks.set(key, bucket);
      }
      bucket.add(p.id);
    }
  }

  const pairs = new Map<string, PersonPair>();
  for (const bucket of blocks.values()) {
    if (bucket.size < 2) continue;
    const ids = [...bucket];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const pair = canonicalPair(ids[i], ids[j]);
        pairs.set(pairKey(pair), pair);
      }
    }
  }

  return [...pairs.values()];
}

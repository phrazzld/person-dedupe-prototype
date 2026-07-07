// Deterministic weighted scoring. This is the weight table from SPEC.md as code.

import type { Person, Signal, Tier } from './types';
import {
  normalizeEmail,
  emailAliasKey,
  normalizePhone,
  normalizeLicensePlate,
  normalizeAddress,
  trigramSimilarity,
  fullNameSimilarity,
  firstNameSimilarity,
  FUZZY_NAME_THRESHOLD,
  FIRST_NAME_CONFLICT_THRESHOLD,
} from './normalize';
import type { Booking } from './types';

export const WEIGHTS = {
  emailExact: 0.35,
  phoneExact: 0.3,
  licensePlateExact: 0.25,
  fullNameExact: 0.2,
  fullNameFuzzy: 0.12,
  addressSimilar: 0.15,
  emailAliasOnly: 0.1,
  firstNameConflict: -0.25,
  bookingOverlapOddity: -0.1,
} as const;

export const ADDRESS_SIMILARITY_THRESHOLD = 0.7;

export const CERTAIN_THRESHOLD = 0.75;
export const AMBIGUOUS_THRESHOLD = 0.25;

/**
 * True when both people have a booking on the same night at a different
 * site — evidence they're physically distinct people, not one person with
 * duplicate records (you can't be in two places at once).
 */
function hasBookingOverlapOddity(aBookings: Booking[], bBookings: Booking[]): boolean {
  for (const a of aBookings) {
    for (const b of bBookings) {
      if (a.site === b.site) continue;
      const overlaps = a.start_date < b.end_date && b.start_date < a.end_date;
      if (overlaps) return true;
    }
  }
  return false;
}

export interface ScoreResult {
  signals: Signal[];
  det_score: number;
  tier: Tier;
  hasCounterSignal: boolean;
}

export function scorePair(a: Person, b: Person, aBookings: Booking[] = [], bBookings: Booking[] = []): ScoreResult {
  const signals: Signal[] = [];
  let total = 0;
  let hasCounterSignal = false;

  // --- email ---
  const emailA = normalizeEmail(a.email);
  const emailB = normalizeEmail(b.email);
  if (emailA && emailB) {
    if (emailA === emailB) {
      signals.push({ field: 'email', kind: 'exact', similarity: 1, a_value: a.email, b_value: b.email, weight: WEIGHTS.emailExact });
      total += WEIGHTS.emailExact;
    } else {
      const aliasA = emailAliasKey(a.email);
      const aliasB = emailAliasKey(b.email);
      if (aliasA && aliasB && aliasA === aliasB) {
        signals.push({ field: 'email', kind: 'alias', similarity: 0.9, a_value: a.email, b_value: b.email, weight: WEIGHTS.emailAliasOnly });
        total += WEIGHTS.emailAliasOnly;
      }
    }
  }

  // --- phone ---
  const phoneA = normalizePhone(a.phone);
  const phoneB = normalizePhone(b.phone);
  if (phoneA && phoneB && phoneA === phoneB) {
    signals.push({ field: 'phone', kind: 'exact', similarity: 1, a_value: a.phone, b_value: b.phone, weight: WEIGHTS.phoneExact });
    total += WEIGHTS.phoneExact;
  }

  // --- license plate ---
  const plateA = normalizeLicensePlate(a.license_plate);
  const plateB = normalizeLicensePlate(b.license_plate);
  if (plateA && plateB && plateA === plateB) {
    signals.push({ field: 'license_plate', kind: 'exact', similarity: 1, a_value: a.license_plate, b_value: b.license_plate, weight: WEIGHTS.licensePlateExact });
    total += WEIGHTS.licensePlateExact;
  }

  // --- full name ---
  const nameSim = fullNameSimilarity(a.first_name, a.last_name, b.first_name, b.last_name);
  if (nameSim === 1) {
    signals.push({
      field: 'full_name',
      kind: 'exact',
      similarity: 1,
      a_value: `${a.first_name} ${a.last_name}`,
      b_value: `${b.first_name} ${b.last_name}`,
      weight: WEIGHTS.fullNameExact,
    });
    total += WEIGHTS.fullNameExact;
  } else if (nameSim >= FUZZY_NAME_THRESHOLD) {
    signals.push({
      field: 'full_name',
      kind: 'fuzzy',
      similarity: nameSim,
      a_value: `${a.first_name} ${a.last_name}`,
      b_value: `${b.first_name} ${b.last_name}`,
      weight: WEIGHTS.fullNameFuzzy,
    });
    total += WEIGHTS.fullNameFuzzy;
  }

  // --- address ---
  const addrA = normalizeAddress(a.address_line);
  const addrB = normalizeAddress(b.address_line);
  if (addrA.core && addrB.core) {
    const addrSim = trigramSimilarity(addrA.core, addrB.core);
    if (addrSim >= ADDRESS_SIMILARITY_THRESHOLD) {
      signals.push({
        field: 'address_line',
        kind: addrSim === 1 ? 'exact' : 'fuzzy',
        similarity: addrSim,
        a_value: a.address_line,
        b_value: b.address_line,
        weight: WEIGHTS.addressSimilar,
      });
      total += WEIGHTS.addressSimilar;
    }
  }

  // --- first name conflict (the spouse counter-signal) ---
  // Only meaningful once the pair already shares strong contact-info
  // evidence (email/phone) — a bare first-name mismatch between two
  // unrelated Robert Millers isn't a "conflict" signal, it's just two
  // different names.
  const sharesContactInfo = signals.some((s) => s.field === 'email' || s.field === 'phone');
  if (sharesContactInfo && a.first_name && b.first_name) {
    const firstSim = firstNameSimilarity(a.first_name, b.first_name);
    if (firstSim < FIRST_NAME_CONFLICT_THRESHOLD) {
      signals.push({
        field: 'first_name',
        kind: 'conflict',
        similarity: firstSim,
        a_value: a.first_name,
        b_value: b.first_name,
        weight: WEIGHTS.firstNameConflict,
      });
      total += WEIGHTS.firstNameConflict;
      hasCounterSignal = true;
    }
  }

  // --- booking overlap oddity ---
  if (hasBookingOverlapOddity(aBookings, bBookings)) {
    signals.push({
      field: 'bookings',
      kind: 'conflict',
      similarity: 0,
      a_value: 'overlapping stay, different site',
      b_value: 'overlapping stay, different site',
      weight: WEIGHTS.bookingOverlapOddity,
    });
    total += WEIGHTS.bookingOverlapOddity;
    hasCounterSignal = true;
  }

  const det_score = Math.max(0, Math.min(1, total));

  let tier: Tier;
  if (det_score >= CERTAIN_THRESHOLD && !hasCounterSignal) {
    tier = 'certain';
  } else if (det_score >= AMBIGUOUS_THRESHOLD || hasCounterSignal) {
    tier = 'ambiguous';
  } else {
    tier = 'weak';
  }

  return { signals, det_score, tier, hasCounterSignal };
}

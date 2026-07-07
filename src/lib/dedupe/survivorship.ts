// Default survivorship rules, shared by the single-merge UI (as the initial
// conflict-resolution state) and the bulk-merge API (which applies these
// defaults with no operator in the loop). Pure — no DB, no framework deps.

import { COMPARABLE_FIELDS } from './types';
import type { Person, FieldDecision } from './types';

/**
 * Primary wins by default. Where the primary's field is null and the
 * secondary's isn't, non-null wins — the secondary's value fills the gap.
 * Fields where both sides agree (or both are null) aren't conflicts at all
 * and are omitted.
 */
export function defaultFieldDecisions(primary: Person, secondary: Person): Record<string, FieldDecision> {
  const decisions: Record<string, FieldDecision> = {};
  for (const field of COMPARABLE_FIELDS) {
    const primaryValue = (primary as unknown as Record<string, string | null>)[field];
    const secondaryValue = (secondary as unknown as Record<string, string | null>)[field];
    if (primaryValue === secondaryValue) continue;
    const kept: 'primary' | 'secondary' = primaryValue === null && secondaryValue !== null ? 'secondary' : 'primary';
    decisions[field] = { kept, primary_value: primaryValue, secondary_value: secondaryValue };
  }
  return decisions;
}

/** "Older record" survivorship: the earlier-created person is primary. */
export function olderPersonIsPrimary(a: Person, b: Person): { primary: Person; secondary: Person } {
  return a.created_at <= b.created_at ? { primary: a, secondary: b } : { primary: b, secondary: a };
}

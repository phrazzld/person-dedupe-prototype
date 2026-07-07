import { describe, it, expect } from 'vitest';
import { defaultFieldDecisions, olderPersonIsPrimary } from '@/lib/dedupe/survivorship';
import type { Person } from '@/lib/dedupe/types';

function person(overrides: Partial<Person>): Person {
  return {
    id: 'x',
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
    ...overrides,
  };
}

describe('defaultFieldDecisions (non-null-wins)', () => {
  it('keeps the primary value when both sides have differing non-null values', () => {
    const primary = person({ id: 'p', phone: '111' });
    const secondary = person({ id: 's', phone: '222' });
    const decisions = defaultFieldDecisions(primary, secondary);
    expect(decisions.phone.kept).toBe('primary');
    expect(decisions.phone.primary_value).toBe('111');
    expect(decisions.phone.secondary_value).toBe('222');
  });

  it('fills from the secondary when the primary field is null (non-null wins)', () => {
    const primary = person({ id: 'p', email: null });
    const secondary = person({ id: 's', email: 'fill@example.com' });
    const decisions = defaultFieldDecisions(primary, secondary);
    expect(decisions.email.kept).toBe('secondary');
    expect(decisions.email.secondary_value).toBe('fill@example.com');
  });

  it('keeps the primary null-over-null and omits agreeing fields entirely', () => {
    const primary = person({ id: 'p', email: 'same@example.com', phone: null });
    const secondary = person({ id: 's', email: 'same@example.com', phone: null });
    const decisions = defaultFieldDecisions(primary, secondary);
    // email agrees, phone agrees (both null) -> no conflicts to resolve
    expect(Object.keys(decisions)).toHaveLength(0);
  });
});

describe('olderPersonIsPrimary', () => {
  it('picks the earlier-created record as primary regardless of argument order', () => {
    const older = person({ id: 'old', created_at: '2025-01-01T00:00:00.000Z' });
    const newer = person({ id: 'new', created_at: '2026-06-01T00:00:00.000Z' });
    expect(olderPersonIsPrimary(newer, older).primary.id).toBe('old');
    expect(olderPersonIsPrimary(older, newer).primary.id).toBe('old');
    expect(olderPersonIsPrimary(newer, older).secondary.id).toBe('new');
  });
});

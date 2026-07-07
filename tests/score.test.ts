import { describe, it, expect } from 'vitest';
import { scorePair, CERTAIN_THRESHOLD, AMBIGUOUS_THRESHOLD } from '@/lib/dedupe/score';
import { PEOPLE, BOOKINGS } from '@/lib/dedupe/seedData';
import type { Person } from '@/lib/dedupe/types';

const personById = new Map(PEOPLE.map((p) => [p.id, p as unknown as Person]));
const bookingsFor = (id: string) => BOOKINGS.filter((b) => b.person_id === id) as any;

function score(aId: string, bId: string) {
  const a = personById.get(aId)!;
  const b = personById.get(bId)!;
  return scorePair(a, b, bookingsFor(aId), bookingsFor(bId));
}

describe('score truth table — every seed case family', () => {
  it('case 1: exact duplicate -> certain, no counter-signal', () => {
    const r = score('case1-a', 'case1-b');
    expect(r.tier).toBe('certain');
    expect(r.det_score).toBeGreaterThanOrEqual(CERTAIN_THRESHOLD);
    expect(r.hasCounterSignal).toBe(false);
    const fields = r.signals.map((s) => s.field);
    expect(fields).toContain('email');
    expect(fields).toContain('full_name');
    expect(fields).toContain('license_plate');
    // phone was typo'd — must NOT register as an exact match
    expect(r.signals.find((s) => s.field === 'phone')).toBeUndefined();
  });

  it('case 2: typo\'d name, same email -> ambiguous (goes to LLM)', () => {
    const r = score('case2-a', 'case2-b');
    expect(r.tier).toBe('ambiguous');
    expect(r.hasCounterSignal).toBe(false);
    expect(r.det_score).toBeGreaterThanOrEqual(AMBIGUOUS_THRESHOLD);
    expect(r.det_score).toBeLessThan(CERTAIN_THRESHOLD);
    const nameSignal = r.signals.find((s) => s.field === 'full_name');
    expect(nameSignal?.kind).toBe('fuzzy');
  });

  it('case 3: nickname + same phone (different formatting) -> ambiguous', () => {
    const r = score('case3-a', 'case3-b');
    expect(r.tier).toBe('ambiguous');
    expect(r.hasCounterSignal).toBe(false);
    const phoneSignal = r.signals.find((s) => s.field === 'phone');
    expect(phoneSignal?.kind).toBe('exact');
    const nameSignal = r.signals.find((s) => s.field === 'full_name');
    expect(nameSignal?.kind).toBe('exact'); // nickname-normalized match
  });

  it('case 4: the spouse trap -> counter-signal present, forced to ambiguous', () => {
    const r = score('case4-a', 'case4-b');
    expect(r.hasCounterSignal).toBe(true);
    expect(r.tier).toBe('ambiguous');
    const conflict = r.signals.find((s) => s.field === 'first_name');
    expect(conflict?.kind).toBe('conflict');
    expect(conflict!.weight).toBeLessThan(0);
    const emailSignal = r.signals.find((s) => s.field === 'email');
    expect(emailSignal?.kind).toBe('exact');
  });

  it('case 5: same name, different people -> weak (dropped)', () => {
    const r = score('case5-a', 'case5-b');
    expect(r.tier).toBe('weak');
    expect(r.det_score).toBeLessThan(AMBIGUOUS_THRESHOLD);
  });

  it('case 6: address + plate, weak name similarity -> ambiguous', () => {
    const r = score('case6-a', 'case6-b');
    expect(r.tier).toBe('ambiguous');
    expect(r.hasCounterSignal).toBe(false);
    const fields = r.signals.map((s) => s.field);
    expect(fields).toContain('license_plate');
    expect(fields).toContain('address_line');
    expect(fields).not.toContain('email');
    expect(fields).not.toContain('phone');
  });

  it('case 7: alias email, same name -> ambiguous', () => {
    const r = score('case7-a', 'case7-b');
    expect(r.tier).toBe('ambiguous');
    const emailSignal = r.signals.find((s) => s.field === 'email');
    expect(emailSignal?.kind).toBe('alias');
    const nameSignal = r.signals.find((s) => s.field === 'full_name');
    expect(nameSignal?.kind).toBe('exact');
  });

  it('case 8 (a,b): maiden -> married name, same email -> ambiguous', () => {
    const r = score('case8-a', 'case8-b');
    expect(r.tier).toBe('ambiguous');
    expect(r.hasCounterSignal).toBe(false);
    expect(r.signals.find((s) => s.field === 'email')?.kind).toBe('exact');
  });

  it('case 8 (b,c): married record, same phone + name, different email -> ambiguous', () => {
    const r = score('case8-b', 'case8-c');
    expect(r.tier).toBe('ambiguous');
    expect(r.hasCounterSignal).toBe(false);
    expect(r.signals.find((s) => s.field === 'phone')?.kind).toBe('exact');
    expect(r.signals.find((s) => s.field === 'full_name')?.kind).toBe('exact');
  });

  it('filler records score as weak/no-signal against each other', () => {
    const r = score('filler-1', 'filler-2');
    expect(r.tier).toBe('weak');
    expect(r.signals.length).toBe(0);
  });
});

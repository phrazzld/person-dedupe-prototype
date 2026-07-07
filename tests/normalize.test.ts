import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  emailAliasKey,
  normalizePhone,
  normalizeLicensePlate,
  normalizePostalCode,
  normalizeName,
  normalizeAddress,
  firstNameSimilarity,
  fullNameSimilarity,
  areNicknames,
  FUZZY_NAME_THRESHOLD,
} from '@/lib/dedupe/normalize';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Sarah.Jimenez@Example.COM ')).toBe('sarah.jimenez@example.com');
  });
  it('does not strip +tags or dots (raw-equal only)', () => {
    expect(normalizeEmail('j.smith+camp@gmail.com')).toBe('j.smith+camp@gmail.com');
  });
  it('returns null for empty/null', () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail('')).toBeNull();
  });
});

describe('emailAliasKey', () => {
  it('folds +tag and gmail dots to the same key', () => {
    expect(emailAliasKey('j.smith+camp@gmail.com')).toBe(emailAliasKey('jsmith@gmail.com'));
  });
  it('does not fold dots on non-gmail domains', () => {
    expect(emailAliasKey('j.smith@example.com')).not.toBe(emailAliasKey('jsmith@example.com'));
  });
});

describe('normalizePhone', () => {
  it('strips formatting and compares last 10 digits', () => {
    expect(normalizePhone('(555) 440-3000')).toBe(normalizePhone('555.440.3000'));
    expect(normalizePhone('(555) 440-3000')).toBe('5554403000');
  });
  it('assumes +1 default for 11-digit numbers', () => {
    expect(normalizePhone('1-555-440-3000')).toBe('5554403000');
  });
  it('treats a changed digit as a non-match', () => {
    expect(normalizePhone('555-201-1000')).not.toBe(normalizePhone('555-201-1009'));
  });
});

describe('normalizeLicensePlate', () => {
  it('strips spaces/dashes and uppercases', () => {
    expect(normalizeLicensePlate('7 XYZ-123')).toBe('7XYZ123');
    expect(normalizeLicensePlate('7xyz123')).toBe('7XYZ123');
  });
});

describe('normalizePostalCode', () => {
  it('trims and uppercases', () => {
    expect(normalizePostalCode(' 80202 ')).toBe('80202');
  });
});

describe('normalizeName', () => {
  it('casefolds, strips diacritics and punctuation', () => {
    expect(normalizeName('José García-López')).toBe('jose garcialopez');
  });
});

describe('normalizeAddress', () => {
  it('expands common abbreviations', () => {
    expect(normalizeAddress('123 Main St').core).toBe('123 main street');
  });
  it('pulls the unit designator into a separate component', () => {
    const { core, unit } = normalizeAddress('123 Main St Apt 4B');
    expect(core).toBe('123 main street');
    expect(unit).toBe('4b');
  });
});

describe('nicknames', () => {
  it('recognizes bob <-> robert', () => {
    expect(areNicknames('Bob', 'Robert')).toBe(true);
  });
  it('has at least 40 pairs of coverage (spot check a spread)', () => {
    const pairs: [string, string][] = [
      ['liz', 'elizabeth'],
      ['bill', 'william'],
      ['jim', 'james'],
      ['mike', 'michael'],
      ['dave', 'david'],
      ['tom', 'thomas'],
      ['chris', 'christopher'],
      ['sam', 'samuel'],
      ['alex', 'alexander'],
      ['kathy', 'katherine'],
      ['jen', 'jennifer'],
      ['rick', 'richard'],
    ];
    for (const [a, b] of pairs) expect(areNicknames(a, b)).toBe(true);
  });
  it('does not falsely match unrelated names', () => {
    expect(areNicknames('Marcus', 'Danielle')).toBe(false);
  });
});

describe('firstNameSimilarity', () => {
  it('scores nickname pairs as 1', () => {
    expect(firstNameSimilarity('Bob', 'Robert')).toBe(1);
  });
  it('scores a clear mismatch below the conflict threshold', () => {
    expect(firstNameSimilarity('Marcus', 'Danielle')).toBeLessThan(0.5);
  });
});

describe('fullNameSimilarity', () => {
  it('scores identical names as exactly 1', () => {
    expect(fullNameSimilarity('Sarah', 'Jimenez', 'Sarah', 'Jimenez')).toBe(1);
  });
  it('scores a typo above the fuzzy threshold but below 1', () => {
    const sim = fullNameSimilarity('Katherine', 'Doyle', 'Kathrine', 'Doyle');
    expect(sim).toBeGreaterThanOrEqual(FUZZY_NAME_THRESHOLD);
    expect(sim).toBeLessThan(1);
  });
  it('scores nickname + matching last name as exactly 1', () => {
    expect(fullNameSimilarity('Robert', 'Chen', 'Bob', 'Chen')).toBe(1);
  });
  it('scores an unrelated first name with matching last name below the fuzzy threshold', () => {
    const sim = fullNameSimilarity('Marcus', 'Webb', 'Danielle', 'Webb');
    expect(sim).toBeLessThan(FUZZY_NAME_THRESHOLD);
  });
});

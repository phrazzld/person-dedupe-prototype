// Pure normalization + similarity functions. No I/O, no framework deps.
// Port order per SPEC.md: this file first.

const DIACRITICS_RE = /[̀-ͯ]/g;

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS_RE, '');
}

export function casefold(s: string): string {
  return stripDiacritics(s).toLowerCase();
}

/** Casefold + strip punctuation, collapse whitespace. Used for name and address tokens. */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return casefold(name)
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeFullName(first: string | null | undefined, last: string | null | undefined): string {
  return `${normalizeName(first)} ${normalizeName(last)}`.trim();
}

/** Lowercase + trim. Does NOT strip +tags or dots — see emailAliasKey for that. */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * A weaker equality key that folds gmail-style aliasing (+tag, and dots on
 * gmail domains specifically) so `j.smith+camp@gmail.com` and `jsmith@gmail.com`
 * key the same. Distinct from normalizeEmail (raw-equal), which is the
 * stronger signal.
 */
export function emailAliasKey(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const at = normalized.lastIndexOf('@');
  if (at < 0) return normalized;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  let localKey = local.split('+')[0];
  if (GMAIL_DOMAINS.has(domain)) {
    localKey = localKey.replace(/\./g, '');
  }
  return `${localKey}@${domain}`;
}

/** Strip to digits, take last 10 (assumes +1/NANP default for anything longer). */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  const last10 = digits.length > 10 ? digits.slice(-10) : digits;
  return last10.length === 10 ? last10 : null;
}

export function normalizeLicensePlate(plate: string | null | undefined): string | null {
  if (!plate) return null;
  const cleaned = plate.replace(/[\s-]/g, '').toUpperCase();
  return cleaned.length ? cleaned : null;
}

export function normalizePostalCode(postal: string | null | undefined): string | null {
  if (!postal) return null;
  const cleaned = postal.trim().toUpperCase().replace(/\s+/g, '');
  return cleaned.length ? cleaned : null;
}

const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  st: 'street',
  rd: 'road',
  ave: 'avenue',
  av: 'avenue',
  dr: 'drive',
  ln: 'lane',
  ct: 'court',
  blvd: 'boulevard',
  pkwy: 'parkway',
  hwy: 'highway',
  pl: 'place',
  ter: 'terrace',
  cir: 'circle',
  sq: 'square',
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
};

const UNIT_RE = /\b(apt|apartment|unit|suite|ste|#)\.?\s*([a-z0-9-]+)\b/i;

/** Expands common abbreviations and pulls the unit designator into a separate component. */
export function normalizeAddress(address: string | null | undefined): { core: string; unit: string | null } {
  if (!address) return { core: '', unit: null };
  let working = casefold(address).replace(/[.,]/g, ' ');
  let unit: string | null = null;
  const unitMatch = working.match(UNIT_RE);
  if (unitMatch) {
    unit = unitMatch[2];
    working = working.replace(UNIT_RE, ' ');
  }
  const core = working
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => ADDRESS_ABBREVIATIONS[tok] ?? tok)
    .join(' ')
    .trim();
  return { core, unit };
}

/** Jaro similarity, 0..1. */
export function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0;

  const matchDistance = Math.floor(Math.max(aLen, bLen) / 2) - 1;
  const aMatches = new Array(aLen).fill(false);
  const bMatches = new Array(bLen).fill(false);
  let matches = 0;

  for (let i = 0; i < aLen; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, bLen);
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < aLen; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions = Math.floor(transpositions / 2);

  return (matches / aLen + matches / bLen + (matches - transpositions) / matches) / 3;
}

/** Jaro-Winkler similarity, 0..1. Boosts scores for strings sharing a prefix. */
export function jaroWinklerSimilarity(a: string, b: string, prefixScale = 0.1): number {
  const jaro = jaroSimilarity(a, b);
  const maxPrefix = Math.min(4, a.length, b.length);
  let prefix = 0;
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * prefixScale * (1 - jaro);
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s}  `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** Dice coefficient over character trigrams, 0..1. Used for address similarity. */
export function trigramSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const setA = trigrams(a);
  const setB = trigrams(b);
  let shared = 0;
  for (const g of setA) if (setB.has(g)) shared++;
  return (2 * shared) / (setA.size + setB.size);
}

// ~60 common English nickname <-> given-name pairs (spec asks for ~40).
const NICKNAME_PAIRS: [string, string][] = [
  ['bob', 'robert'], ['bobby', 'robert'], ['rob', 'robert'], ['robbie', 'robert'],
  ['liz', 'elizabeth'], ['beth', 'elizabeth'], ['betty', 'elizabeth'], ['eliza', 'elizabeth'],
  ['bill', 'william'], ['will', 'william'], ['willy', 'william'], ['billy', 'william'],
  ['jim', 'james'], ['jimmy', 'james'], ['jamie', 'james'],
  ['mike', 'michael'], ['mikey', 'michael'],
  ['dave', 'david'],
  ['dan', 'daniel'], ['danny', 'daniel'],
  ['tom', 'thomas'], ['tommy', 'thomas'],
  ['chris', 'christopher'], ['topher', 'christopher'],
  ['matt', 'matthew'],
  ['nick', 'nicholas'], ['nicky', 'nicholas'],
  ['sam', 'samuel'], ['sammy', 'samuel'],
  ['alex', 'alexander'], ['sandy', 'alexander'],
  ['andy', 'andrew'], ['drew', 'andrew'],
  ['ken', 'kenneth'], ['kenny', 'kenneth'],
  ['joe', 'joseph'], ['joey', 'joseph'],
  ['ed', 'edward'], ['eddie', 'edward'], ['ted', 'edward'],
  ['steve', 'steven'],
  ['pat', 'patrick'],
  ['tony', 'anthony'],
  ['ron', 'ronald'],
  ['larry', 'lawrence'],
  ['jerry', 'gerald'],
  ['ben', 'benjamin'], ['benny', 'benjamin'],
  ['sue', 'susan'], ['suzy', 'susan'],
  ['peggy', 'margaret'], ['maggie', 'margaret'], ['meg', 'margaret'],
  ['kathy', 'katherine'], ['kate', 'katherine'], ['katie', 'katherine'],
  ['cathy', 'catherine'],
  ['jen', 'jennifer'], ['jenny', 'jennifer'],
  ['debbie', 'deborah'], ['deb', 'deborah'],
  ['cindy', 'cynthia'],
  ['patty', 'patricia'], ['tricia', 'patricia'],
  ['abby', 'abigail'],
  ['jess', 'jessica'], ['jessie', 'jessica'],
  ['vicky', 'victoria'], ['tori', 'victoria'],
  ['nate', 'nathan'], ['nathaniel', 'nathan'],
  ['al', 'albert'], ['bert', 'albert'],
  ['fred', 'frederick'], ['freddy', 'frederick'],
  ['charlie', 'charles'], ['chuck', 'charles'],
  ['frank', 'francis'],
  ['greg', 'gregory'],
  ['phil', 'philip'],
  ['rick', 'richard'], ['dick', 'richard'], ['richie', 'richard'],
  ['stan', 'stanley'],
  ['walt', 'walter'],
];

const NICKNAME_GROUPS: Map<string, string> = new Map();
for (const [nick, full] of NICKNAME_PAIRS) {
  NICKNAME_GROUPS.set(nick, full);
  if (!NICKNAME_GROUPS.has(full)) NICKNAME_GROUPS.set(full, full);
}

function canonicalGivenName(normalizedName: string): string {
  return NICKNAME_GROUPS.get(normalizedName) ?? normalizedName;
}

/** True when a and b are known nickname/given-name variants of each other (not identical). */
export function areNicknames(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb || na === nb) return false;
  return canonicalGivenName(na) === canonicalGivenName(nb);
}

/**
 * Similarity for a single given/first name, 0..1. Exact match and known
 * nickname pairs both score 1; otherwise falls back to Jaro-Winkler.
 */
export function firstNameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (areNicknames(na, nb)) return 1;
  return jaroWinklerSimilarity(na, nb);
}

/**
 * Similarity for a "first last" name pair, 0..1 — the average of
 * (nickname-aware) first-name similarity and last-name similarity. A
 * nickname match on the first name plus an exact last name therefore scores
 * 1, same as a literal exact match; this is what lets "Bob Chen" score as
 * an exact full-name hit against "Robert Chen".
 */
export function fullNameSimilarity(
  aFirst: string | null | undefined,
  aLast: string | null | undefined,
  bFirst: string | null | undefined,
  bLast: string | null | undefined,
): number {
  const na1 = normalizeName(aFirst);
  const nb1 = normalizeName(bFirst);
  const na2 = normalizeName(aLast);
  const nb2 = normalizeName(bLast);
  if (!na1 || !nb1 || !na2 || !nb2) return 0;
  const firstSim = firstNameSimilarity(aFirst, bFirst);
  const lastSim = na2 === nb2 ? 1 : jaroWinklerSimilarity(na2, nb2);
  return (firstSim + lastSim) / 2;
}

export const FUZZY_NAME_THRESHOLD = 0.85;
export const FIRST_NAME_CONFLICT_THRESHOLD = 0.5;

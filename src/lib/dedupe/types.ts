// Shared types for the dedupe pipeline. Mirrors the data model in SPEC.md.

export type PersonStatus = 'active' | 'merged';

export interface Person {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null; // ISO date; blocking key + strongest distinct-person signal
  address_line: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  license_plate: string | null;
  notes: string | null;
  status: PersonStatus;
  merged_into: string | null;
  created_at: string;
  updated_at: string;
}

export type BookingStatus = 'upcoming' | 'completed' | 'cancelled';

export interface Booking {
  id: string;
  person_id: string;
  site: string;
  start_date: string;
  end_date: string;
  total_cents: number;
  status: BookingStatus;
  created_at: string;
}

export type SignalKind = 'exact' | 'fuzzy' | 'conflict' | 'alias';

export interface Signal {
  field: string;
  kind: SignalKind;
  similarity: number; // 0..1
  a_value: string | null;
  b_value: string | null;
  weight: number; // the weighted contribution, can be negative for counter-signals
}

export type Tier = 'certain' | 'likely' | 'ambiguous' | 'weak';

export type Verdict = 'duplicate' | 'distinct_people' | 'unclear';

export type DistinctHypothesis = 'spouse' | 'parent_child' | 'roommate' | 'coincidence' | null;

export type FieldWeight = 'strong' | 'moderate' | 'weak' | 'counter';

export interface LlmAdjudication {
  confidence: number; // 0..100
  verdict: Verdict;
  distinct_hypothesis: DistinctHypothesis;
  field_weights: Record<string, FieldWeight>;
  rationale: string; // one line, <=120 chars
  model_version: string; // e.g. the OpenRouter model id, or "fixture"
  scored_at: string; // ISO timestamp — reproducibility/audit
}

export type CandidateStatus = 'open' | 'dismissed' | 'merged';

export type BlockingRule = 'email' | 'phone' | 'plate' | 'name_zip' | 'name_dob' | 'full_name';

export type Bucket = 'suggested' | 'review' | 'ignored';

export interface DuplicateCandidate {
  id: string;
  person_a_id: string;
  person_b_id: string;
  blocking_rules: BlockingRule[];
  signals: Signal[];
  det_score: number;
  tier: Tier;
  llm: LlmAdjudication | null;
  bucket: Bucket;
  status: CandidateStatus;
  created_at: string;
  updated_at: string;
}

export interface FieldDecision {
  kept: 'primary' | 'secondary';
  primary_value: string | null;
  secondary_value: string | null;
}

export interface MergeCounts {
  bookings: {
    primary_before: number;
    secondary_before: number;
    after: number;
  };
}

export interface MergeEvent {
  id: string;
  primary_id: string;
  secondary_id: string;
  candidate_id: string | null;
  field_decisions: Record<string, FieldDecision>;
  moved_children: { bookings: string[] };
  snapshot_before: { primary: Person; secondary: Person };
  counts: MergeCounts;
  actor: string;
  reversed_at: string | null;
  created_at: string;
}

// The scalar person fields that participate in normalization, scoring, and
// merge conflict resolution.
export const COMPARABLE_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'date_of_birth',
  'address_line',
  'city',
  'region',
  'postal_code',
  'license_plate',
] as const;

export type ComparableField = (typeof COMPARABLE_FIELDS)[number];

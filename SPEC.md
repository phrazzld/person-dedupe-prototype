# Person Deduplication — Detection, Review, and Merge

**Reference-implementation spec.** This repo prototypes the full shape of a
duplicate-person-record capability for an admin web application that manages
customer profiles with attached transactional records (reservations/bookings,
purchases, etc.). It is deliberately built *outside* the host application: a
public, self-contained tracer bullet an engineer can read end-to-end and then
port into the host app with its real tables, auth, and job runner.

The demo evaluation this design serves grades three things:

1. **Detection intelligence** — how smart is the system about what is and
   isn't a duplicate (the canonical trap: same email + different first name is
   probably a *spouse*, not a duplicate — flagging it "duplicate, same email"
   is the naive answer this design must beat).
2. **Merge transparency** — the operator sees exactly what a merge will do
   before it happens, and exactly what it did after.
3. **Data integrity preservation** — nothing is destroyed. Child records all
   arrive at the surviving profile; the losing profile is archived, not
   deleted; every merge is auditable and reversible.

## Design stance

- **Two-layer detection.** A deterministic layer does the cheap, explainable
  work: normalization, candidate generation (blocking), field-signal scoring.
  An LLM layer adjudicates only the ambiguous middle band — scoring
  confidence and, critically, recognizing *distinct-person* patterns
  (spouse/household sharing contact info) that rule-based systems misflag.
  Obvious duplicates never pay for a model call; obvious non-candidates are
  never generated.
- **Cheap, fast models only.** The adjudication call is a
  commodity-tier model (Haiku/DeepSeek-class, pennies per batch). Latency and
  cost budgets are set so a nightly batch over thousands of profiles costs
  cents. Never a frontier model; this task doesn't need one.
- **Confidence is UI state, not prose.** The LLM's output is structured:
  a confidence score and per-field signal weights. The review UI renders
  those as *field highlighting* (strong signal = strong highlight, weak =
  faint) plus one confidence badge — not paragraphs to read. At most one
  short rationale line per pair. Operators reviewing 40 candidate pairs
  should be scanning color and numbers, not reading essays.
- **Wide net.** Tuned for false positives over false negatives: a missed
  duplicate is invisible and permanent; a bad suggestion costs one dismissal
  click. Dismissals are recorded and suppress re-flagging of that pair.
- **The merge is the product.** Detection gets you a list; trust is won or
  lost in the merge. Everything about the merge flow optimizes for operator
  confidence: explicit primary selection, field-level conflict resolution
  with no silent "smart" merging, a preview of every consequence before
  commit, a verification panel after, an audit record always, and undo.

## Data model

Five tables. Names are generic; the host app maps them onto its own schema.

```
people
  id            uuid pk
  first_name    text
  last_name     text
  email         text nullable
  phone         text nullable          -- stored raw; normalized at compare time
  address_line  text nullable
  city          text nullable
  region        text nullable          -- state/province
  postal_code   text nullable
  license_plate text nullable
  notes         text nullable
  status        'active' | 'merged'    -- merged = archived tombstone, hidden from default lists
  merged_into   uuid nullable fk people.id
  created_at, updated_at

bookings                                -- representative child-record type; stands in for
  id            uuid pk                 -- every transactional table hanging off a person
  person_id     uuid fk people.id
  site          text                    -- e.g. "Site 14", "Cabin B"
  start_date, end_date                  -- dates
  total_cents   integer
  status        'upcoming' | 'completed' | 'cancelled'
  created_at

duplicate_candidates                    -- one row per unordered pair
  id            uuid pk
  person_a_id   uuid fk
  person_b_id   uuid fk                 -- invariant: (a,b) canonically ordered, unique
  signals       json                    -- [{field, kind: exact|fuzzy|conflict, similarity 0..1, a_value, b_value}]
  det_score     real                    -- deterministic weighted score 0..1
  tier          'certain' | 'likely' | 'ambiguous' | 'weak'
  llm           json nullable           -- {confidence 0..100, verdict: duplicate|distinct_people|unclear,
                                        --  distinct_hypothesis: spouse|parent_child|coincidence|null,
                                        --  field_weights: {field: strong|moderate|weak|counter}, rationale: <one line>}
  status        'open' | 'dismissed' | 'merged'
  created_at, updated_at

merge_events                            -- the audit + reversibility spine
  id            uuid pk
  primary_id    uuid                    -- survivor
  secondary_id  uuid                    -- archived
  candidate_id  uuid nullable fk
  field_decisions json                  -- {field: {kept: 'primary'|'secondary', primary_value, secondary_value}}
  moved_children  json                  -- {bookings: [ids...]}  (extensible per child type)
  snapshot_before json                  -- FULL person rows for both sides, pre-merge
  counts          json                  -- {bookings: {primary_before, secondary_before, after}}
  actor           text
  reversed_at     timestamp nullable    -- set on unmerge
  created_at
```

**Integrity invariants** (enforced in the merge engine, asserted in tests):

- A merge never deletes a row in any table. The secondary person flips to
  `status='merged', merged_into=<primary>`; children are re-parented.
- `counts.after == primary_before + secondary_before` for every child type,
  checked inside the merge transaction; mismatch aborts.
- A merged person cannot be the target or source of a new merge until
  unmerged. Chains resolve through `merged_into` for display.
- Unmerge restores both person rows from `snapshot_before`, re-parents
  exactly the children listed in `moved_children` back to the secondary,
  clears the tombstone, sets `reversed_at`, and reopens the candidate pair.
  Children created on the primary *after* the merge stay with the primary.

## Detection pipeline

Runs as a batch job (manual "Scan now" button in the prototype; cron/queue
worker in the host app) plus a synchronous single-record check used by the
create-person flow. Both share the same code path.

**1. Normalize** (pure functions, unit-tested):
- email: lowercase, trim; compare full string (do NOT strip +tags or dots —
  gmail-style aliasing is itself a duplicate signal, but a weaker one:
  compare both raw-equal and alias-equal as distinct signal kinds)
- phone: strip to digits, normalize country prefix (assume +1 default),
  compare last 10
- name: casefold, strip punctuation/diacritics; compare with a similarity
  metric (Jaro-Winkler or trigram, threshold ~0.85 for fuzzy-match) plus a
  small nickname table (bob↔robert, liz↔elizabeth, ~40 common pairs)
- address: casefold, expand common abbreviations (st→street, apt→apartment),
  strip unit designators into a separate component, then similarity-compare
- license_plate: strip spaces/dashes, uppercase, exact compare

**2. Candidate generation (blocking).** Never O(n²) pairwise over everything.
A pair becomes a candidate iff it shares at least one blocking key:
normalized email | normalized phone | normalized license plate |
(normalized last_name + postal_code) | (normalized first_name+last_name).
Union the blocks, dedupe pairs, skip pairs already merged or dismissed.

**3. Deterministic scoring.** Weighted signals per field:

| signal | weight | notes |
|---|---|---|
| email exact | 0.35 | strongest single signal |
| phone exact | 0.30 | |
| license plate exact | 0.25 | |
| full name exact | 0.20 | fuzzy ≥0.85 → 0.12 |
| address similar | 0.15 | |
| email alias-equal only | 0.10 | |
| **first name conflict** (different given names, similarity <0.5) | **−0.25** | the spouse counter-signal |
| date-of-overlap oddities (both have bookings same night, different sites) | −0.10 | distinct-people evidence |

`det_score = clamp(Σ weights, 0, 1)`. Tiers:
- `certain` ≥ 0.75 **and** no counter-signals → skip LLM, confidence = 95+
- `ambiguous` 0.25–0.75, or any counter-signal present → **LLM adjudication**
- `weak` < 0.25 → drop (wide net has limits; these are noise)

**4. LLM adjudication** (ambiguous band only, batched — up to ~20 pairs per
call):
- Input: both records (the compared fields only — no notes/free text), the
  deterministic signals, and the instruction set (see `prompts/adjudicate.md`
  in the implementation).
- Output (JSON, schema-validated, retried once on invalid): per pair —
  `confidence` 0–100, `verdict` duplicate/distinct_people/unclear,
  `distinct_hypothesis` (spouse | parent_child | roommate | coincidence |
  null), `field_weights` (per-field strong/moderate/weak/counter — this
  drives the UI highlighting), `rationale` (ONE line, ≤120 chars).
- The canonical case the prompt must handle: same email or phone, different
  first names, same last name/address → `distinct_people`,
  `distinct_hypothesis: spouse`, confidence ≤ 25. (Household members share
  contact info; the host app removed family accounts, so these are
  legitimately separate profiles.)
- Model: configurable via env (`LLM_MODEL`, default a fast commodity model
  through OpenRouter). **Fixture mode is the default when no API key is
  set**: the seeded candidate pairs carry pre-recorded adjudications
  (`fixtures/adjudications.json`) so the entire demo runs with zero keys,
  zero cost, zero latency. The live path and fixture path produce
  identical-shaped data.

## Surfaces (three, in priority order)

**1. Suggested Duplicates report** (`/duplicates`) — the primary surface.
A new page under Reports. Table of open candidate pairs, sorted by
confidence descending. Each row: the two names, one confidence badge
(numeric + color band: ≥90 red-hot, 60–89 warm, <60 cool), and the shared
fields rendered as chips whose intensity maps the field_weight
(strong signal = saturated highlight, weak = faint, counter-signal =
struck-through/gray). Distinct-people verdicts (e.g. spouse) render in a
separate collapsed section — "Reviewed and believed distinct (N)" — showing
the system was smart enough to look and decline. Row actions: **Review &
merge** → detail; **Dismiss** (records suppression); **Not duplicates**
(same as dismiss, distinct verdict recorded).

**2. Create-person duplicate check.** On the new-profile form, on blur of
email/phone/name (debounced) and again on submit: run the synchronous check
against active people. On hit: a non-blocking warning panel — "This may be
a duplicate of **Sarah Jimenez** (email matches, name 92% similar)" — with
links to open the existing profile ("Use this instead") and to the
duplicates report. Creation is never hard-blocked (call-center reality:
sometimes you really do want a new record). No merging from this surface.

**3. Person-page badge** (stretch, cheap once 1 exists). If this person
appears in any open candidate pair: a banner chip "Possible duplicate —
review" linking into the report filtered to this person.

## Merge flow (the star)

From a candidate pair's detail page:

1. **Compare view.** Both records side by side, every field, matching fields
   highlighted per field_weights, conflicts marked. Child records summarized
   under each side (e.g. "7 bookings, latest Aug 12" / "6 bookings, latest
   Sep 3").
2. **Choose primary.** Explicit radio — no default submission. Copy explains:
   primary survives; secondary is archived into it.
3. **Resolve conflicts.** For each scalar field where both sides have
   different non-null values: pick which value wins (defaults to primary's,
   but every conflict is shown and individually flippable). **There is no
   silent smart-merge**: unsupported/complex fields are listed plainly as
   "kept from primary — merging this field type isn't supported" rather than
   guessed at.
4. **Preview.** One screen stating exactly what will happen: N bookings move
   from secondary to primary (listed); these field values change on primary;
   secondary becomes an archived profile referencing primary; this action is
   recorded and reversible. Confirm button states the action fully ("Merge
   Robert C. into Robert Chen").
5. **Execute.** Single transaction implementing the invariants above.
6. **Verify.** Post-merge panel: before/after child counts per type
   (7 + 6 → 13 ✓), the moved records listed with their key facts intact,
   link to the audit event, and an **Unmerge** button.
7. **Audit.** `/merges` lists all merge events: who, when, what moved, field
   decisions, reversed-or-not. Every event expands to its full snapshot.
   Unmerge is right there.

## Seed dataset (the demo IS the dataset)

`npm run seed` creates ~24 people + bookings engineered to exercise every
detection behavior. The families of cases, each labeled in seed comments:

1. **Exact duplicate** — same everything, one typo'd phone. → certain, no LLM.
2. **Typo'd name** — "Katherine Doyle" / "Kathrine Doyle", same email. → certain/high.
3. **Nickname** — "Robert Chen" / "Bob Chen", same phone, different emails. → high.
4. **The spouse trap** — "Marcus Webb" / "Danielle Webb", same email + address,
   different phones. → distinct_people (spouse), low confidence. **The demo's
   money shot: the system explains why it's NOT flagging this.**
5. **Same name, different people** — two "James Millers", different everything
   else, different cities. → weak/dropped or low-confidence distinct.
6. **Address + plate** — same license plate and address, name similarity 0.6
   ("A. Rodriguez" / "Alejandro Rodriguez"), no shared email/phone. → ambiguous → LLM → high.
7. **Alias email** — j.smith+camp@ vs j.smith@, same name. → high.
8. **Three-way cluster** — one person with three records (old email, new email,
   maiden name) chained by overlapping signals. → two pairs; merging one
   updates the other's display.
9. Filler legitimate records so the report isn't 100% hits.

Both members of case 1 and case 6 carry bookings on both sides so the merge
demo shows real child-record movement and count verification.

## Implementation shape (this prototype)

- **Stack: Next.js (App Router) + TypeScript + SQLite (better-sqlite3).**
  One process, `npm install && npm run seed && npm run dev`, zero external
  services. *Deliberate non-Rust exception: this artifact's entire value is
  readability for the host-app team porting it; their world is web-stack.
  The logic worth porting (normalization, blocking, scoring, merge engine)
  is plain dependency-light TypeScript, isolated in `src/lib/dedupe/`.*
- `src/lib/dedupe/normalize.ts` — pure normalizers (ported first).
- `src/lib/dedupe/candidates.ts` — blocking + pair generation.
- `src/lib/dedupe/score.ts` — signals, weights, tiers (the table above, as code).
- `src/lib/dedupe/adjudicate.ts` — LLM batch call + fixture fallback + schema
  validation.
- `src/lib/dedupe/merge.ts` — merge/unmerge engine, transactional, invariant
  checks. **The most port-critical file.**
- `src/app/(pages)` — duplicates report, pair detail/merge flow, merges audit,
  people list, person page, create-person form.
- API routes mirror what the host app would expose: `POST /api/scan`,
  `GET /api/duplicates`, `POST /api/duplicates/:id/dismiss`,
  `POST /api/check` (single-record), `POST /api/merge`, `POST /api/merges/:id/unmerge`.
- Tests: vitest over normalize/score/candidates (truth tables per seed case
  family) and merge/unmerge invariants (counts conserved, snapshot restore
  exact, post-merge children stay on unmerge). UI is demo-verified by
  screenshot, not e2e-tested — fast and loose is the brief.

## What's a demo shortcut vs. real (honesty ledger)

| Shortcut here | Real version in the host app |
|---|---|
| "Scan now" button | scheduled job (hourly/nightly) in the host job runner |
| One child type (bookings) | every transactional table; the merge engine's child-mover is a per-type list for exactly this reason |
| No auth/roles | admin-permission-gated; actor from session |
| SQLite | host DB; merge engine must keep single-transaction semantics |
| Fixture adjudications default | live cheap-model calls, batched, cached on the candidate row (score once, render forever — re-adjudicate only when either record changes) |
| Confidence colors tuned by eyeball | thresholds tuned against real dismissal/merge feedback data |

## Host-app integration notes (handoff)

1. Port order: normalize → score truth tables (bring the tests) → candidates
   over real person table with real blocking indexes → merge engine mapped to
   the real child tables → UI last (patterns transfer, markup won't).
2. Open questions for the host team, discovered writing this spec:
   is email-or-phone uniqueness actually enforced at write time? (Affects
   which seed cases can occur.) Where do archived/tombstoned people surface
   in existing search? Does any existing table already reference people by
   natural key (email) rather than id (breaks re-parenting)?
3. The candidate row's `llm` JSON is deliberately shaped so the UI never
   needs a live model call — adjudication happens in the pipeline, rendering
   is pure data. Keep that seam when porting.
4. Suppression memory (dismissed pairs) must survive re-scans, or operators
   will dismiss the same false positive weekly and stop trusting the page.

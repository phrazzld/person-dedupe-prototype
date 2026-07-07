# person-dedupe-prototype

Reference implementation: duplicate person-record **detection, review, and
merge** for an admin app with customer profiles + transactional child records.

Built as a public, self-contained tracer bullet — read `SPEC.md` first; it is
the contract this code implements and the document to port from.

## Run it

```sh
npm install
npm run seed     # creates SQLite db with ~24 engineered demo records
npm run dev      # http://localhost:3000
```

Zero external services. Works with no API key (pre-recorded LLM
adjudications for the seeded data). Set `OPENROUTER_API_KEY` (+ optionally
`LLM_MODEL`) to exercise the live adjudication path.

## The 90-second demo

1. **/duplicates** — candidate pairs ranked by confidence; matching fields
   highlighted by signal strength; the spouse case sitting in "believed
   distinct" with a low score (the system explains what it did NOT flag).
2. Open the Robert Chen pair → compare view → choose primary → resolve the
   phone conflict → preview (bookings that will move) → **merge**.
3. Verification panel: booking counts conserved, moved records intact,
   audit event linked. Hit **Unmerge** and watch it come back.
4. **/people/new** — type a seeded email; the inline duplicate warning fires.

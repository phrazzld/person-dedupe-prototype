// The demo dataset: ~24 people engineered to exercise every case family in
// SPEC.md's "Seed dataset" section. Shared by scripts/seed.ts and the test
// truth tables so the two never drift apart.
//
// Each PersonSeed's `notes` field also carries a human-readable case label —
// visible on the person page in the running app, not just in this comment.

export interface PersonSeed {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address_line: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  license_plate: string | null;
  notes: string | null;
}

export interface BookingSeed {
  id: string;
  person_id: string;
  site: string;
  start_date: string;
  end_date: string;
  total_cents: number;
  status: 'upcoming' | 'completed' | 'cancelled';
}

export const PEOPLE: PersonSeed[] = [
  // --- Case 1: exact duplicate, one typo'd phone -> certain, no LLM. ---
  {
    id: 'case1-a',
    first_name: 'Sarah',
    last_name: 'Jimenez',
    email: 'sarah.jimenez@example.com',
    phone: '555-201-1000',
    address_line: '14 Birch Court',
    city: 'Denver',
    region: 'CO',
    postal_code: '80202',
    license_plate: '1ABC234',
    notes: 'Seed case 1 (exact duplicate) — record A.',
  },
  {
    id: 'case1-b',
    first_name: 'Sarah',
    last_name: 'Jimenez',
    email: 'sarah.jimenez@example.com',
    phone: '555-201-1009', // typo'd last digit
    address_line: '14 Birch Court',
    city: 'Denver',
    region: 'CO',
    postal_code: '80202',
    license_plate: '1ABC234',
    notes: 'Seed case 1 (exact duplicate) — record B.',
  },

  // --- Case 2: typo'd name, same email -> ambiguous, LLM confirms high. ---
  {
    id: 'case2-a',
    first_name: 'Katherine',
    last_name: 'Doyle',
    email: 'katherine.doyle@example.com',
    phone: '555-330-2001',
    address_line: '88 Elm Street',
    city: 'Austin',
    region: 'TX',
    postal_code: '73301',
    license_plate: null,
    notes: 'Seed case 2 (typo\'d name) — record A.',
  },
  {
    id: 'case2-b',
    first_name: 'Kathrine', // typo, missing the second "e"
    last_name: 'Doyle',
    email: 'katherine.doyle@example.com',
    phone: '555-330-2099',
    address_line: '410 Sable Ridge Dr',
    city: 'Austin',
    region: 'TX',
    postal_code: '73344',
    license_plate: null,
    notes: 'Seed case 2 (typo\'d name) — record B.',
  },

  // --- Case 3: nickname, same phone (different formatting), diff emails.
  // The demo's featured merge — see README. Bookings on both sides so the
  // merge preview shows real records moving.
  {
    id: 'case3-a',
    first_name: 'Robert',
    last_name: 'Chen',
    email: 'robert.chen@example.com',
    phone: '(555) 440-3000',
    address_line: '200 Pine Ave',
    city: 'Seattle',
    region: 'WA',
    postal_code: '98101',
    license_plate: null,
    notes: 'Seed case 3 (nickname) — record A.',
  },
  {
    id: 'case3-b',
    first_name: 'Bob',
    last_name: 'Chen',
    email: 'bobchen99@mail.com',
    phone: '555.440.3000', // same digits as A, different raw formatting
    address_line: '310 Cascade Ct',
    city: 'Seattle',
    region: 'WA',
    postal_code: '98102',
    license_plate: null,
    notes: 'Seed case 3 (nickname) — record B.',
  },

  // --- Case 4: the spouse trap. Same email + address, different phones and
  // first names -> distinct_people (spouse), low confidence. The demo's
  // money shot: the system explains why it's NOT flagging this.
  {
    id: 'case4-a',
    first_name: 'Marcus',
    last_name: 'Webb',
    email: 'webbfamily@example.com',
    phone: '555-661-4001',
    address_line: '5 Lighthouse Way',
    city: 'Charleston',
    region: 'SC',
    postal_code: '29401',
    license_plate: null,
    notes: 'Seed case 4 (spouse trap) — record A.',
  },
  {
    id: 'case4-b',
    first_name: 'Danielle',
    last_name: 'Webb',
    email: 'webbfamily@example.com',
    phone: '555-661-4002',
    address_line: '5 Lighthouse Way',
    city: 'Charleston',
    region: 'SC',
    postal_code: '29401',
    license_plate: null,
    notes: 'Seed case 4 (spouse trap) — record B.',
  },

  // --- Case 5: same name, different people -> weak, dropped. ---
  {
    id: 'case5-a',
    first_name: 'James',
    last_name: 'Miller',
    email: 'james.miller.a@example.com',
    phone: '555-777-5551',
    address_line: '10 Oak Dr',
    city: 'Boise',
    region: 'ID',
    postal_code: '83701',
    license_plate: null,
    notes: 'Seed case 5 (same name, different people) — record A.',
  },
  {
    id: 'case5-b',
    first_name: 'James',
    last_name: 'Miller',
    email: 'jmiller.other@example.com',
    phone: '555-888-6662',
    address_line: '500 River Rd',
    city: 'Tulsa',
    region: 'OK',
    postal_code: '74101',
    license_plate: null,
    notes: 'Seed case 5 (same name, different people) — record B.',
  },

  // --- Case 6: address + plate match, weak name similarity, no shared
  // email/phone -> ambiguous, LLM confirms high. Bookings on both sides.
  {
    id: 'case6-a',
    first_name: 'A.',
    last_name: 'Rodriguez',
    email: 'a.rodriguez@example.com',
    phone: '555-111-7771',
    address_line: '77 Maple Lane',
    city: 'Phoenix',
    region: 'AZ',
    postal_code: '85001',
    license_plate: '7XYZ123',
    notes: 'Seed case 6 (address + plate) — record A.',
  },
  {
    id: 'case6-b',
    first_name: 'Alejandro',
    last_name: 'Rodriguez',
    email: 'alex.rod@differentmail.com',
    phone: '555-222-8882',
    address_line: '77 Maple Lane',
    city: 'Phoenix',
    region: 'AZ',
    postal_code: '85001',
    license_plate: '7 XYZ-123', // same plate, different raw formatting
    notes: 'Seed case 6 (address + plate) — record B.',
  },

  // --- Case 7: alias email, same name -> ambiguous, LLM confirms high. ---
  {
    id: 'case7-a',
    first_name: 'Jordan',
    last_name: 'Smith',
    email: 'j.smith+camp@gmail.com',
    phone: '555-333-9991',
    address_line: '45 Cedar St',
    city: 'Miami',
    region: 'FL',
    postal_code: '33101',
    license_plate: null,
    notes: 'Seed case 7 (alias email) — record A.',
  },
  {
    id: 'case7-b',
    first_name: 'Jordan',
    last_name: 'Smith',
    email: 'j.smith@gmail.com',
    phone: '555-444-0002',
    address_line: '900 Bay Dr',
    city: 'Miami',
    region: 'FL',
    postal_code: '33139',
    license_plate: null,
    notes: 'Seed case 7 (alias email) — record B.',
  },

  // --- Case 8: three-way cluster. One person, three records: maiden name +
  // old email (a), married name + old email (b, links to a), married name +
  // new email (c, links to b via phone/name). Exactly two candidate pairs:
  // (a,b) and (b,c) — a and c share no blocking key directly.
  {
    id: 'case8-a',
    first_name: 'Elena',
    last_name: 'Foster',
    email: 'elena.foster@oldmail.com',
    phone: '555-901-1000',
    address_line: '12 Sunset Blvd',
    city: 'Tampa',
    region: 'FL',
    postal_code: '33602',
    license_plate: null,
    notes: 'Seed case 8 (three-way cluster) — maiden name, oldest record.',
  },
  {
    id: 'case8-b',
    first_name: 'Elena',
    last_name: 'Marsh',
    email: 'elena.foster@oldmail.com', // carried over from case8-a
    phone: '555-901-2000',
    address_line: '99 Bayshore Dr',
    city: 'Tampa',
    region: 'FL',
    postal_code: '33606',
    license_plate: null,
    notes: 'Seed case 8 (three-way cluster) — married name, old email.',
  },
  {
    id: 'case8-c',
    first_name: 'Elena',
    last_name: 'Marsh',
    email: 'elena.marsh@newmail.com',
    phone: '555-901-2000', // same as case8-b
    address_line: '99 Bayshore Dr',
    city: 'Tampa',
    region: 'FL',
    postal_code: '33606',
    license_plate: null,
    notes: 'Seed case 8 (three-way cluster) — married name, newest email.',
  },

  // --- Case 9: filler legitimate records. Fully isolated: no shared
  // blocking key with each other or with any case above. ---
  {
    id: 'filler-1',
    first_name: 'Nina',
    last_name: 'Alvarez',
    email: 'nina.alvarez@example.com',
    phone: '555-101-0001',
    address_line: '1 First St',
    city: 'Portland',
    region: 'OR',
    postal_code: '97201',
    license_plate: null,
    notes: 'Filler record — no duplicate.',
  },
  {
    id: 'filler-2',
    first_name: 'Derek',
    last_name: 'Osei',
    email: 'derek.osei@example.com',
    phone: '555-102-0002',
    address_line: '2 Second St',
    city: 'Columbus',
    region: 'OH',
    postal_code: '43201',
    license_plate: null,
    notes: 'Filler record — no duplicate.',
  },
  {
    id: 'filler-3',
    first_name: 'Priya',
    last_name: 'Nair',
    email: 'priya.nair@example.com',
    phone: '555-103-0003',
    address_line: '3 Third St',
    city: 'Raleigh',
    region: 'NC',
    postal_code: '27601',
    license_plate: null,
    notes: 'Filler record — no duplicate.',
  },
  {
    id: 'filler-4',
    first_name: 'Owen',
    last_name: 'Kavanagh',
    email: 'owen.kavanagh@example.com',
    phone: '555-104-0004',
    address_line: '4 Fourth St',
    city: 'Madison',
    region: 'WI',
    postal_code: '53701',
    license_plate: null,
    notes: 'Filler record — no duplicate.',
  },
  {
    id: 'filler-5',
    first_name: 'Yuki',
    last_name: 'Tanaka',
    email: 'yuki.tanaka@example.com',
    phone: '555-105-0005',
    address_line: '5 Fifth St',
    city: 'Sacramento',
    region: 'CA',
    postal_code: '95801',
    license_plate: null,
    notes: 'Filler record — no duplicate.',
  },
  {
    id: 'filler-6',
    first_name: 'Grace',
    last_name: 'Okafor',
    email: 'grace.okafor@example.com',
    phone: '555-106-0006',
    address_line: '6 Sixth St',
    city: 'Louisville',
    region: 'KY',
    postal_code: '40201',
    license_plate: null,
    notes: 'Filler record — no duplicate.',
  },
  {
    id: 'filler-7',
    first_name: 'Hassan',
    last_name: 'Ali',
    email: 'hassan.ali@example.com',
    phone: '555-107-0007',
    address_line: '7 Seventh St',
    city: 'Richmond',
    region: 'VA',
    postal_code: '23218',
    license_plate: null,
    notes: 'Filler record — no duplicate.',
  },
];

function booking(
  id: string,
  personId: string,
  site: string,
  startDate: string,
  endDate: string,
  totalCents: number,
  status: BookingSeed['status'] = 'completed',
): BookingSeed {
  return { id, person_id: personId, site, start_date: startDate, end_date: endDate, total_cents: totalCents, status };
}

export const BOOKINGS: BookingSeed[] = [
  // Case 1 — both sides have bookings so the merge demo shows movement.
  booking('bk-c1a-1', 'case1-a', 'Site 14', '2026-05-01', '2026-05-04', 32000, 'completed'),
  booking('bk-c1a-2', 'case1-a', 'Cabin B', '2026-08-12', '2026-08-15', 45000, 'upcoming'),
  booking('bk-c1b-1', 'case1-b', 'Site 22', '2026-03-10', '2026-03-12', 21000, 'completed'),

  // Case 2
  booking('bk-c2a-1', 'case2-a', 'Site 3', '2026-04-01', '2026-04-03', 18000, 'completed'),
  booking('bk-c2b-1', 'case2-b', 'Site 8', '2026-06-15', '2026-06-18', 27000, 'upcoming'),

  // Case 3 — Robert Chen, the featured merge demo.
  booking('bk-c3a-1', 'case3-a', 'Site 5', '2026-02-10', '2026-02-14', 42000, 'completed'),
  booking('bk-c3a-2', 'case3-a', 'Site 9', '2026-05-20', '2026-05-22', 22000, 'completed'),
  booking('bk-c3a-3', 'case3-a', 'Cabin A', '2026-09-01', '2026-09-05', 51000, 'upcoming'),
  booking('bk-c3b-1', 'case3-b', 'Site 12', '2026-01-05', '2026-01-08', 25000, 'completed'),
  booking('bk-c3b-2', 'case3-b', 'Site 30', '2026-07-20', '2026-07-23', 30000, 'upcoming'),

  // Case 4 — spouses, never merge, but still real people with real stays.
  booking('bk-c4a-1', 'case4-a', 'Site 17', '2026-06-01', '2026-06-04', 33000, 'upcoming'),
  booking('bk-c4b-1', 'case4-b', 'Site 17', '2026-06-01', '2026-06-04', 33000, 'upcoming'),

  // Case 5
  booking('bk-c5a-1', 'case5-a', 'Site 2', '2026-03-01', '2026-03-03', 15000, 'completed'),
  booking('bk-c5b-1', 'case5-b', 'Site 40', '2026-04-15', '2026-04-17', 19000, 'completed'),

  // Case 6 — address + plate match, bookings on both sides.
  booking('bk-c6a-1', 'case6-a', 'Site 11', '2026-02-01', '2026-02-05', 40000, 'completed'),
  booking('bk-c6b-1', 'case6-b', 'Site 25', '2026-05-05', '2026-05-09', 44000, 'upcoming'),

  // Case 7
  booking('bk-c7a-1', 'case7-a', 'Site 6', '2026-01-20', '2026-01-22', 16000, 'completed'),
  booking('bk-c7b-1', 'case7-b', 'Site 6', '2026-07-01', '2026-07-04', 28000, 'upcoming'),

  // Case 8
  booking('bk-c8a-1', 'case8-a', 'Site 1', '2025-11-01', '2025-11-03', 14000, 'completed'),
  booking('bk-c8b-1', 'case8-b', 'Site 1', '2026-04-01', '2026-04-04', 26000, 'completed'),
  booking('bk-c8c-1', 'case8-c', 'Site 1', '2026-08-01', '2026-08-05', 47000, 'upcoming'),

  // Fillers — realistic, isolated.
  booking('bk-f1-1', 'filler-1', 'Site 4', '2026-03-05', '2026-03-08', 20000, 'completed'),
  booking('bk-f2-1', 'filler-2', 'Site 19', '2026-06-10', '2026-06-12', 17000, 'upcoming'),
  booking('bk-f3-1', 'filler-3', 'Site 27', '2026-02-20', '2026-02-23', 24000, 'completed'),
  booking('bk-f4-1', 'filler-4', 'Site 33', '2026-07-15', '2026-07-18', 31000, 'upcoming'),
  booking('bk-f5-1', 'filler-5', 'Site 41', '2026-01-10', '2026-01-13', 22000, 'completed'),
  booking('bk-f6-1', 'filler-6', 'Site 8', '2026-08-20', '2026-08-23', 29000, 'upcoming'),
  booking('bk-f7-1', 'filler-7', 'Site 15', '2026-04-25', '2026-04-27', 18000, 'completed'),
];

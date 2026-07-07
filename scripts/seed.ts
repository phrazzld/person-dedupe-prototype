import fs from 'node:fs';
import { DB_PATH, getDb, resetDbSingleton } from '../src/lib/dedupe/db';
import { PEOPLE, BOOKINGS } from '../src/lib/dedupe/seedData';
import { runScan } from '../src/lib/dedupe/pipeline';

function nowIso(): string {
  return new Date().toISOString();
}

async function main() {
  resetDbSingleton();
  for (const suffix of ['', '-wal', '-shm']) {
    const p = DB_PATH + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  const db = getDb();
  const now = nowIso();

  const insertPerson = db.prepare(
    `INSERT INTO people
      (id, first_name, last_name, email, phone, date_of_birth, address_line, city, region, postal_code, license_plate, notes, status, merged_into, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?)`,
  );
  const insertBooking = db.prepare(
    `INSERT INTO bookings (id, person_id, site, start_date, end_date, total_cents, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const insertAll = db.transaction(() => {
    for (const p of PEOPLE) {
      insertPerson.run(
        p.id,
        p.first_name,
        p.last_name,
        p.email,
        p.phone,
        p.date_of_birth,
        p.address_line,
        p.city,
        p.region,
        p.postal_code,
        p.license_plate,
        p.notes,
        now,
        now,
      );
    }
    for (const b of BOOKINGS) {
      insertBooking.run(b.id, b.person_id, b.site, b.start_date, b.end_date, b.total_cents, b.status, now);
    }
  });
  insertAll();

  console.log(`Seeded ${PEOPLE.length} people and ${BOOKINGS.length} bookings.`);

  const usingLive = Boolean(process.env.OPENROUTER_API_KEY);
  console.log(`Running detection scan (${usingLive ? 'live OpenRouter' : 'fixture'} adjudication path)...`);
  const result = await runScan(db);
  console.log('Scan complete:', result);

  const byTierStatus = db
    .prepare('SELECT tier, status, COUNT(*) as n FROM duplicate_candidates GROUP BY tier, status ORDER BY tier, status')
    .all();
  console.log('Candidates by tier/status:', byTierStatus);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

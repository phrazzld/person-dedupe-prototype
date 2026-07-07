import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = process.env.DEDUPE_DB_PATH ?? path.join(process.cwd(), 'data', 'dedupe.db');

let instance: Database.Database | null = null;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS people (
  id            TEXT PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  date_of_birth TEXT,
  address_line  TEXT,
  city          TEXT,
  region        TEXT,
  postal_code   TEXT,
  license_plate TEXT,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','merged')),
  merged_into   TEXT REFERENCES people(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES people(id),
  site        TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','completed','cancelled')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_person ON bookings(person_id);

CREATE TABLE IF NOT EXISTS duplicate_candidates (
  id             TEXT PRIMARY KEY,
  person_a_id    TEXT NOT NULL REFERENCES people(id),
  person_b_id    TEXT NOT NULL REFERENCES people(id),
  blocking_rules TEXT NOT NULL DEFAULT '[]',
  signals        TEXT NOT NULL,
  det_score      REAL NOT NULL,
  tier           TEXT NOT NULL CHECK (tier IN ('certain','likely','ambiguous','weak')),
  llm            TEXT,
  bucket         TEXT NOT NULL CHECK (bucket IN ('suggested','review','ignored')),
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','merged')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(person_a_id, person_b_id)
);

CREATE TABLE IF NOT EXISTS merge_events (
  id              TEXT PRIMARY KEY,
  primary_id      TEXT NOT NULL,
  secondary_id    TEXT NOT NULL,
  candidate_id    TEXT REFERENCES duplicate_candidates(id),
  field_decisions TEXT NOT NULL,
  moved_children  TEXT NOT NULL,
  snapshot_before TEXT NOT NULL,
  counts          TEXT NOT NULL,
  actor           TEXT NOT NULL,
  reversed_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

function createConnection(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}

/** Process-wide singleton connection. Tests pass their own in-memory instance instead. */
export function getDb(): Database.Database {
  if (!instance) {
    instance = createConnection();
  }
  return instance;
}

/** Fresh in-memory database with the schema applied — used by tests. */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}

export function resetDbSingleton() {
  instance?.close();
  instance = null;
}

export { DB_PATH };

/**
 * Schema migrations. All tables are defined up front so later milestones don't
 * need to re-migrate. Only `sessions` and `events` are exercised in M1.
 */
import type Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  project TEXT,
  cwd TEXT,
  started_at INTEGER,
  last_event_at INTEGER,
  status TEXT,
  data TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  event TEXT,
  ts INTEGER,
  payload TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_session ON events (session_id, ts DESC);

CREATE TABLE IF NOT EXISTS servers_registered (
  id TEXT PRIMARY KEY,
  name TEXT,
  cwd TEXT,
  command TEXT,
  created_at INTEGER,
  pid INTEGER
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  project TEXT,
  tool_name TEXT,
  summary TEXT,
  detail TEXT,
  state TEXT,
  created_at INTEGER,
  resolved_at INTEGER,
  decided_by TEXT,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS telegram (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  chat_id TEXT,
  bot_token TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  telemetry_share INTEGER DEFAULT 1,
  model TEXT DEFAULT 'claude-code',
  last_tokens INTEGER DEFAULT 0,
  last_cost REAL DEFAULT 0
);
`;

/** Run all CREATE TABLE IF NOT EXISTS statements. Idempotent. */
export function runMigrations(db: Database.Database): void {
  db.exec(SCHEMA);
}

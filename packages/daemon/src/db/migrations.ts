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
  last_cost REAL DEFAULT 0,
  telegram_mode TEXT DEFAULT 'shared'
);

-- Persisted cost/token usage, one row per local calendar day. Survives daemon
-- restarts so "today" and the lifetime total aren't lost; also doubles as the
-- per-day history a future trends view can read.
CREATE TABLE IF NOT EXISTS cost_daily (
  day TEXT PRIMARY KEY,
  usd REAL NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0
);
`;

/**
 * Additive column migrations for the `settings` singleton. SQLite has no
 * "ADD COLUMN IF NOT EXISTS", so we probe the column list and add what's
 * missing. Each is wrapped so a pre-existing column (older db where SCHEMA
 * already created it) is a harmless no-op rather than a thrown error.
 */
function migrateSettingsColumns(db: Database.Database): void {
  const cols = new Set(
    (db.prepare("PRAGMA table_info(settings)").all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );
  if (!cols.has("telegram_mode")) {
    db.exec(
      "ALTER TABLE settings ADD COLUMN telegram_mode TEXT DEFAULT 'shared'",
    );
  }
}

/** Run all CREATE TABLE IF NOT EXISTS statements. Idempotent. */
export function runMigrations(db: Database.Database): void {
  db.exec(SCHEMA);
  migrateSettingsColumns(db);
}

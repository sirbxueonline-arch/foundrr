/**
 * Persistence for raw hook events (append-only audit log).
 */
import type Database from "better-sqlite3";

import type { RecentEvent } from "@mission-control/shared";

interface EventRow {
  event: string;
  ts: number;
  payload: string;
}

/** Append a hook event to the events table. Payload is JSON-serialized. */
export function insertEvent(
  db: Database.Database,
  sessionId: string,
  event: string,
  ts: number,
  payload: unknown,
): void {
  const stmt = db.prepare(
    "INSERT INTO events (session_id, event, ts, payload) VALUES (?, ?, ?, ?)",
  );
  stmt.run(sessionId, event, ts, safeStringify(payload));
}

/** Fetch the most recent events for a session, newest-first. */
export function recentEvents(
  db: Database.Database,
  sessionId: string,
  limit: number,
): RecentEvent[] {
  const stmt = db.prepare(
    "SELECT event, ts, payload FROM events WHERE session_id = ? ORDER BY ts DESC LIMIT ?",
  );
  const rows = stmt.all(sessionId, limit) as EventRow[];
  return rows.map((row) => ({
    ts: row.ts,
    event: row.event,
    detail: row.payload,
  }));
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

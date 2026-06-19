/**
 * Persistence for derived session state. The full AgentSession is stored as JSON
 * in the `data` column; indexed columns mirror a few fields for cheap querying.
 */
import type Database from "better-sqlite3";

import type { AgentSession } from "@mission-control/shared";

interface SessionRow {
  data: string;
}

/** Insert or replace a session's full derived state. */
export function upsertSession(
  db: Database.Database,
  session: AgentSession,
): void {
  const stmt = db.prepare(
    `INSERT INTO sessions
       (session_id, project, cwd, started_at, last_event_at, status, data)
     VALUES (@session_id, @project, @cwd, @started_at, @last_event_at, @status, @data)
     ON CONFLICT(session_id) DO UPDATE SET
       project = excluded.project,
       cwd = excluded.cwd,
       started_at = excluded.started_at,
       last_event_at = excluded.last_event_at,
       status = excluded.status,
       data = excluded.data`,
  );
  stmt.run({
    session_id: session.sessionId,
    project: session.project,
    cwd: session.cwd,
    started_at: session.startedAt,
    last_event_at: session.lastEventAt,
    status: session.status,
    data: JSON.stringify(session),
  });
}

/** Load all persisted sessions. Rows that fail to parse are skipped. */
export function allSessions(db: Database.Database): AgentSession[] {
  const rows = db.prepare("SELECT data FROM sessions").all() as SessionRow[];
  const sessions: AgentSession[] = [];
  for (const row of rows) {
    const parsed = parseSession(row.data);
    if (parsed) {
      sessions.push(parsed);
    }
  }
  return sessions;
}

/** Load a single session by id, or undefined if absent/corrupt. */
export function getSession(
  db: Database.Database,
  id: string,
): AgentSession | undefined {
  const row = db
    .prepare("SELECT data FROM sessions WHERE session_id = ?")
    .get(id) as SessionRow | undefined;
  if (!row) {
    return undefined;
  }
  return parseSession(row.data) ?? undefined;
}

/** Remove a session by id. */
export function deleteSession(db: Database.Database, id: string): void {
  db.prepare("DELETE FROM sessions WHERE session_id = ?").run(id);
}

function parseSession(data: string): AgentSession | null {
  try {
    return JSON.parse(data) as AgentSession;
  } catch {
    return null;
  }
}

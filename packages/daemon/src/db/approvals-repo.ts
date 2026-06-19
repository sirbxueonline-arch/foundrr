/**
 * Persistence for approval requests. Mirrors sessions-repo: a thin CRUD layer
 * over the `approvals` table (defined up front in migrations.ts). The store
 * keeps an in-memory map for speed; this layer is the durable log so a daemon
 * restart can recover recent state and the dashboard's history survives.
 */
import type Database from "better-sqlite3";

import type {
  ApprovalRequest,
  ApprovalState,
} from "@mission-control/shared";

interface ApprovalRow {
  id: string;
  session_id: string;
  project: string;
  tool_name: string;
  summary: string;
  detail: string;
  state: string;
  created_at: number;
  resolved_at: number | null;
  decided_by: string | null;
  reason: string | null;
}

/** Map a DB row to the client-facing ApprovalRequest shape. */
function rowToRequest(row: ApprovalRow): ApprovalRequest {
  const req: ApprovalRequest = {
    id: row.id,
    sessionId: row.session_id,
    project: row.project,
    toolName: row.tool_name,
    summary: row.summary,
    detail: row.detail,
    state: row.state as ApprovalState,
    createdAt: row.created_at,
  };
  // Only attach optional fields when present (exactOptional-friendly).
  const withResolved =
    row.resolved_at === null ? req : { ...req, resolvedAt: row.resolved_at };
  const withDecidedBy =
    row.decided_by === null
      ? withResolved
      : { ...withResolved, decidedBy: row.decided_by as "telegram" | "dashboard" };
  return row.reason === null
    ? withDecidedBy
    : { ...withDecidedBy, reason: row.reason };
}

/** Insert or replace an approval request. */
export function upsertApproval(
  db: Database.Database,
  req: ApprovalRequest,
): void {
  db.prepare(
    `INSERT INTO approvals
       (id, session_id, project, tool_name, summary, detail, state,
        created_at, resolved_at, decided_by, reason)
     VALUES
       (@id, @session_id, @project, @tool_name, @summary, @detail, @state,
        @created_at, @resolved_at, @decided_by, @reason)
     ON CONFLICT(id) DO UPDATE SET
       session_id = excluded.session_id,
       project = excluded.project,
       tool_name = excluded.tool_name,
       summary = excluded.summary,
       detail = excluded.detail,
       state = excluded.state,
       created_at = excluded.created_at,
       resolved_at = excluded.resolved_at,
       decided_by = excluded.decided_by,
       reason = excluded.reason`,
  ).run({
    id: req.id,
    session_id: req.sessionId,
    project: req.project,
    tool_name: req.toolName,
    summary: req.summary,
    detail: req.detail,
    state: req.state,
    created_at: req.createdAt,
    resolved_at: req.resolvedAt ?? null,
    decided_by: req.decidedBy ?? null,
    reason: req.reason ?? null,
  });
}

/** Load all pending approvals, newest first. Used to recover state on restart. */
export function pendingApprovals(db: Database.Database): ApprovalRequest[] {
  const rows = db
    .prepare(
      "SELECT * FROM approvals WHERE state = 'pending' ORDER BY created_at DESC",
    )
    .all() as ApprovalRow[];
  return rows.map(rowToRequest);
}

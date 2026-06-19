/**
 * ApprovalStore — owns the lifecycle of remote-approval requests.
 *
 * Responsibilities:
 *   - create()  : mint a pending request, persist it, broadcast {type:"approval"}.
 *   - resolve() : record an allow/deny decision (idempotent), persist, broadcast
 *                 {type:"approval_resolved"}.
 *   - get()     : look up a request by id (in-memory).
 *   - listActive(): pending + a few recently-resolved, for the dashboard snapshot.
 *   - a TTL sweeper that expires stale pending requests (start()/stop()).
 *
 * The hook's GET /approvals/:id reads `state` via stateOf(); pending requests
 * are expired by the sweeper at APPROVAL_TTL_MS, aligned just past the hook's
 * ~48s poll budget so a late decision can never resolve a dead request.
 */
import { randomUUID } from "node:crypto";

import type {
  ApprovalDecision,
  ApprovalRequest,
  ApprovalState,
} from "@mission-control/shared";

import {
  APPROVAL_RECENT_RESOLVED_CAP,
  APPROVAL_SWEEP_INTERVAL_MS,
  APPROVAL_TTL_MS,
} from "../constants.js";
import { pendingApprovals, upsertApproval } from "../db/approvals-repo.js";
import type { StreamRegistry } from "../ws/registry.js";
import type Database from "better-sqlite3";

export interface CreateApprovalInput {
  readonly sessionId: string;
  readonly project: string;
  readonly toolName: string;
  readonly summary: string;
  readonly detail: string;
}

/** Map an internal decision verb to the resolved approval state. */
function decisionToState(decision: ApprovalDecision): ApprovalState {
  return decision === "allow" ? "allowed" : "denied";
}

/** True for any terminal state (no further transitions allowed). */
function isResolved(state: ApprovalState): boolean {
  return state !== "pending";
}

export class ApprovalStore {
  private readonly requests = new Map<string, ApprovalRequest>();
  private sweeper: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly registry: StreamRegistry,
    private readonly db: Database.Database,
  ) {
    this.loadFromDb();
  }

  /** Recover pending requests from the db (e.g. after a restart). */
  private loadFromDb(): void {
    try {
      for (const req of pendingApprovals(this.db)) {
        this.requests.set(req.id, req);
      }
    } catch (err) {
      process.stderr.write(
        `[approvals] failed to load pending: ${describe(err)}\n`,
      );
    }
  }

  /** Mint a pending request, persist, and broadcast it. */
  create(input: CreateApprovalInput, now: number = Date.now()): ApprovalRequest {
    const req: ApprovalRequest = {
      id: randomUUID(),
      sessionId: input.sessionId,
      project: input.project,
      toolName: input.toolName,
      summary: input.summary,
      detail: input.detail,
      state: "pending",
      createdAt: now,
    };
    this.requests.set(req.id, req);
    this.persist(req);
    this.registry.broadcast({ type: "approval", approval: req });
    return req;
  }

  /**
   * Resolve a request with a decision. Idempotent: if already resolved (or
   * unknown), this is a no-op and returns the current value (or undefined).
   */
  resolve(
    id: string,
    decision: ApprovalDecision,
    decidedBy: "telegram" | "dashboard",
    reason?: string,
    now: number = Date.now(),
  ): ApprovalRequest | undefined {
    const current = this.requests.get(id);
    if (!current) {
      return undefined;
    }
    if (isResolved(current.state)) {
      return current; // already decided/expired — ignore.
    }

    const next: ApprovalRequest = {
      ...current,
      state: decisionToState(decision),
      resolvedAt: now,
      decidedBy,
      ...(reason && reason.trim().length > 0 ? { reason: reason.trim() } : {}),
    };
    this.requests.set(id, next);
    this.persist(next);
    this.registry.broadcast({ type: "approval_resolved", approval: next });
    return next;
  }

  /** Look up a request by id (in-memory). */
  get(id: string): ApprovalRequest | undefined {
    return this.requests.get(id);
  }

  /**
   * The hook-facing state for an id. Unknown ids map to "expired" so a race
   * (the request was swept out of memory) resolves cleanly: the hook treats
   * "expired" as a clean defer to the local prompt rather than retrying.
   */
  stateOf(id: string): { state: ApprovalState; reason?: string } {
    const req = this.requests.get(id);
    if (!req) {
      return { state: "expired" };
    }
    return req.reason ? { state: req.state, reason: req.reason } : { state: req.state };
  }

  /**
   * Active list for the dashboard snapshot: all pending requests plus the most
   * recent few resolved ones (so a fresh tab still shows what was just decided).
   */
  listActive(): ApprovalRequest[] {
    const all = [...this.requests.values()];
    const pending = all
      .filter((r) => r.state === "pending")
      .sort((a, b) => b.createdAt - a.createdAt);
    const recentlyResolved = all
      .filter((r) => r.state !== "pending")
      .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))
      .slice(0, APPROVAL_RECENT_RESOLVED_CAP);
    return [...pending, ...recentlyResolved];
  }

  /** Start the TTL sweeper. Safe to call once. */
  start(): void {
    if (this.sweeper) {
      return;
    }
    this.sweeper = setInterval(
      () => this.sweepExpired(),
      APPROVAL_SWEEP_INTERVAL_MS,
    );
    this.sweeper.unref?.();
  }

  /** Stop the TTL sweeper. */
  stop(): void {
    if (this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = undefined;
    }
  }

  /** Expire pending requests older than APPROVAL_TTL_MS. */
  private sweepExpired(now: number = Date.now()): void {
    for (const [id, req] of this.requests) {
      if (req.state !== "pending") {
        continue;
      }
      if (now - req.createdAt < APPROVAL_TTL_MS) {
        continue;
      }
      const expired: ApprovalRequest = {
        ...req,
        state: "expired",
        resolvedAt: now,
      };
      this.requests.set(id, expired);
      this.persist(expired);
      this.registry.broadcast({ type: "approval_resolved", approval: expired });
    }
  }

  /** Persist a request, swallowing db errors (never break the flow). */
  private persist(req: ApprovalRequest): void {
    try {
      upsertApproval(this.db, req);
    } catch (err) {
      process.stderr.write(`[approvals] persist failed: ${describe(err)}\n`);
    }
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

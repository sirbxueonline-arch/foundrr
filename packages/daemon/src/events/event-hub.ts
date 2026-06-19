/**
 * EventHub — owns the in-memory map of derived sessions, persists them, and
 * broadcasts updates. Runs an idle sweeper that demotes silent sessions.
 */
import type Database from "better-sqlite3";

import type { AgentSession, IncomingHookEvent } from "@mission-control/shared";

import { IDLE_AFTER_MS, IDLE_SWEEP_INTERVAL_MS } from "../constants.js";
import { insertEvent } from "../db/events-repo.js";
import {
  allSessions,
  deleteSession,
  upsertSession,
} from "../db/sessions-repo.js";
import type { StreamRegistry } from "../ws/registry.js";
import { deriveSession } from "./derive.js";

const STATUS_RANK: Record<string, number> = {
  active: 0,
  waiting: 1,
  error: 2,
  idle: 3,
  ended: 4,
};

/**
 * A side-channel notifier (e.g. Telegram). Injected via setNotifier() from
 * server.ts so the EventHub stays decoupled — no hard import cycle. Never
 * awaited inside ingest; failures are the notifier's own concern.
 */
export type Notifier = (text: string) => void;

export class EventHub {
  private readonly sessions = new Map<string, AgentSession>();
  private sweeper: ReturnType<typeof setInterval> | undefined;
  private notifier: Notifier | undefined;

  constructor(
    private readonly db: Database.Database,
    private readonly registry: StreamRegistry,
  ) {
    this.loadFromDb();
  }

  /** Install (or replace) the away-surface notifier. Optional. */
  setNotifier(notifier: Notifier): void {
    this.notifier = notifier;
  }

  private loadFromDb(): void {
    try {
      for (const session of allSessions(this.db)) {
        this.sessions.set(session.sessionId, session);
      }
    } catch (err) {
      process.stderr.write(
        `[event-hub] failed to load sessions: ${describe(err)}\n`,
      );
    }
  }

  /** Ingest a validated hook event: derive, persist, broadcast. */
  ingest(ev: IncomingHookEvent, now: number = Date.now()): AgentSession {
    const prev = this.sessions.get(ev.session_id);
    const next = deriveSession(prev, ev, now);
    this.sessions.set(next.sessionId, next);

    try {
      upsertSession(this.db, next);
      insertEvent(this.db, ev.session_id, ev.hook_event_name, now, ev);
    } catch (err) {
      process.stderr.write(`[event-hub] persist failed: ${describe(err)}\n`);
    }

    this.registry.broadcast({ type: "session", session: next });
    this.maybeNotify(ev, prev, next);
    return next;
  }

  /**
   * Fire the away-surface notifier on meaningful status EDGES only (never on
   * every sweep), so the phone isn't spammed:
   *   - Stop  : an active/waiting session went idle → "finished — now idle".
   *   - Notification : the session is now waiting on the user → "needs attention".
   */
  private maybeNotify(
    ev: IncomingHookEvent,
    prev: AgentSession | undefined,
    next: AgentSession,
  ): void {
    if (!this.notifier) {
      return;
    }
    const prevStatus = prev?.status;

    if (ev.hook_event_name === "Stop" && prevStatus !== "idle") {
      this.notifier(`✅ ${next.project} finished — now idle`);
      return;
    }

    if (ev.hook_event_name === "Notification" && prevStatus !== "waiting") {
      const message = typeof ev.message === "string" ? ev.message.trim() : "";
      const tail = message.length > 0 ? message : "needs attention";
      this.notifier(`🔔 ${next.project}: ${tail}`);
    }
  }

  /** Snapshot of all sessions, sorted active-first then by recency. */
  getSnapshot(): AgentSession[] {
    return [...this.sessions.values()].sort((a, b) => {
      const rankA = STATUS_RANK[a.status] ?? 99;
      const rankB = STATUS_RANK[b.status] ?? 99;
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return b.lastEventAt - a.lastEventAt;
    });
  }

  /** Remove a session everywhere and notify clients. */
  remove(sessionId: string): void {
    if (!this.sessions.delete(sessionId)) {
      return;
    }
    try {
      deleteSession(this.db, sessionId);
    } catch (err) {
      process.stderr.write(`[event-hub] delete failed: ${describe(err)}\n`);
    }
    this.registry.broadcast({ type: "session_removed", sessionId });
  }

  /** Start the idle sweeper. Safe to call once. */
  start(): void {
    if (this.sweeper) {
      return;
    }
    this.sweeper = setInterval(() => this.sweepIdle(), IDLE_SWEEP_INTERVAL_MS);
    // Don't keep the process alive solely for the sweeper.
    this.sweeper.unref?.();
  }

  /** Stop the idle sweeper. */
  stop(): void {
    if (this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = undefined;
    }
  }

  private sweepIdle(now: number = Date.now()): void {
    for (const [id, session] of this.sessions) {
      const isLive = session.status === "active" || session.status === "waiting";
      if (!isLive) {
        continue;
      }
      if (now - session.lastEventAt <= IDLE_AFTER_MS) {
        continue;
      }
      const next: AgentSession = {
        ...session,
        status: "idle",
        current: { kind: "idle", label: "Idle — no recent activity", since: now },
      };
      this.sessions.set(id, next);
      try {
        upsertSession(this.db, next);
      } catch (err) {
        process.stderr.write(
          `[event-hub] sweep persist failed: ${describe(err)}\n`,
        );
      }
      this.registry.broadcast({ type: "session", session: next });
    }
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

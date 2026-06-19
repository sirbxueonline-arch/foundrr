/**
 * CostStore — in-memory aggregation of Claude Code cost/token telemetry.
 *
 * OTLP counters arrive as DELTA increments (see otel/parse.ts), so every
 * recorded value is added to running totals: one per-session map plus today's
 * rolling totals. The "today" totals are tied to the local calendar day; when
 * the day rolls over we reset them so the "$ today" meter stays correct.
 *
 * After ingest we debounce-broadcast a {type:"cost"} message to all WS clients
 * so many datapoints from a single OTLP push coalesce into one fan-out.
 *
 * Persistence: M5 keeps totals in memory only. A daemon restart zeroes
 * "$ today" / per-session totals — acceptable for this milestone (the meter is
 * a live readout, not a billing ledger). Persisting a daily total to SQLite is
 * a follow-up if the restart-zeroing proves annoying.
 */
import type { CostSnapshot, CostMessage } from "@mission-control/shared";

import { COST_BROADCAST_DEBOUNCE_MS } from "../constants.js";
import type { StreamRegistry } from "../ws/registry.js";

interface SessionTotals {
  usd: number;
  tokens: number;
}

export class CostStore {
  /** Per-session running totals, keyed by session.id. */
  private readonly sessions = new Map<string, SessionTotals>();
  /** The local calendar day these `today*` totals belong to. */
  private currentDay: string;
  private todayUsd = 0;
  private todayTokens = 0;
  private updatedAt = 0;
  private broadcastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly registry: StreamRegistry,
    now: number = Date.now(),
  ) {
    this.currentDay = new Date(now).toDateString();
  }

  /** Reset today's totals if the local day has advanced since last ingest. */
  private rolloverIfNeeded(now: number): void {
    const day = new Date(now).toDateString();
    if (day !== this.currentDay) {
      this.currentDay = day;
      this.todayUsd = 0;
      this.todayTokens = 0;
    }
  }

  private session(id: string): SessionTotals {
    let totals = this.sessions.get(id);
    if (!totals) {
      totals = { usd: 0, tokens: 0 };
      this.sessions.set(id, totals);
    }
    return totals;
  }

  /** Accumulate a USD increment for a session and today's total. */
  recordCost(sessionId: string, usd: number, now: number = Date.now()): void {
    if (!Number.isFinite(usd) || usd === 0) {
      return;
    }
    this.rolloverIfNeeded(now);
    this.session(sessionId).usd += usd;
    this.todayUsd += usd;
    this.updatedAt = now;
    this.scheduleBroadcast();
  }

  /** Accumulate a token increment for a session and today's total. */
  recordTokens(sessionId: string, n: number, now: number = Date.now()): void {
    if (!Number.isFinite(n) || n === 0) {
      return;
    }
    this.rolloverIfNeeded(now);
    this.session(sessionId).tokens += n;
    this.todayTokens += n;
    this.updatedAt = now;
    this.scheduleBroadcast();
  }

  /** Current immutable snapshot of cost state. */
  snapshot(now: number = Date.now()): CostSnapshot {
    this.rolloverIfNeeded(now);
    const sessions: Record<string, SessionTotals> = {};
    for (const [id, totals] of this.sessions) {
      sessions[id] = { usd: totals.usd, tokens: totals.tokens };
    }
    return {
      todayUsd: this.todayUsd,
      todayTokens: this.todayTokens,
      sessions,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Process-lifetime running totals (sum over all sessions). Unlike the "today"
   * meter these never reset on a day rollover, so the telemetry reporter can
   * diff them against a persisted watermark to emit monotonic deltas.
   */
  lifetimeTotals(): { usd: number; tokens: number } {
    let usd = 0;
    let tokens = 0;
    for (const totals of this.sessions.values()) {
      usd += totals.usd;
      tokens += totals.tokens;
    }
    return { usd, tokens };
  }

  /** Coalesce rapid ingests into a single broadcast within the debounce window. */
  private scheduleBroadcast(): void {
    if (this.broadcastTimer) {
      return;
    }
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = undefined;
      const msg: CostMessage = { type: "cost", cost: this.snapshot() };
      this.registry.broadcast(msg);
    }, COST_BROADCAST_DEBOUNCE_MS);
    // Don't keep the event loop alive solely for a pending cost broadcast.
    this.broadcastTimer.unref?.();
  }

  /** Cancel any pending broadcast (used on shutdown). */
  stop(): void {
    if (this.broadcastTimer) {
      clearTimeout(this.broadcastTimer);
      this.broadcastTimer = undefined;
    }
  }
}

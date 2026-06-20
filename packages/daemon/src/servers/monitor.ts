/**
 * ServerMonitor — owns the latest DetectedServer[] snapshot. Scans listening
 * ports every SERVER_SCAN_INTERVAL_MS, reconciles each detected process against
 * registered servers, and broadcasts a `servers` message when the set changes.
 *
 * A failed scan never kills the interval and never throws up the stack.
 */
import type Database from "better-sqlite3";

import type { DetectedServer, RegisteredServer } from "@mission-control/shared";

import { SERVER_SCAN_INTERVAL_MS } from "../constants.js";
import type { StreamRegistry } from "../ws/registry.js";
import { listRegistered } from "./registered-repo.js";
import { scanListening } from "./scan.js";

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Attach a registeredId to detected servers whose command+cwd or pid matches a
 * known RegisteredServer. Returns new objects (no mutation of inputs).
 */
function reconcile(
  detected: readonly DetectedServer[],
  registered: readonly RegisteredServer[],
): DetectedServer[] {
  if (registered.length === 0) {
    return [...detected];
  }
  return detected.map((server): DetectedServer => {
    const match = registered.find((reg) => {
      if (reg.pid !== undefined && reg.pid === server.pid) {
        return true;
      }
      // Command match (cwd is not always known on a detected proc). Avoid
      // false positives on short common tokens ("node", "npm", "next"): accept
      // an EXACT command match, or a substring match only for a reasonably
      // specific (>=8 char) registered command.
      const cmd = reg.command.trim();
      return (
        cmd.length > 0 &&
        (server.command === cmd ||
          (cmd.length >= 8 && server.command.includes(cmd)))
      );
    });
    return match ? { ...server, registeredId: match.id } : server;
  });
}

/** Stable signature of a server set, used to detect change between scans. */
function signature(servers: readonly DetectedServer[]): string {
  return servers
    .map((s) => `${s.port}:${s.pid}:${s.registeredId ?? ""}`)
    .sort()
    .join("|");
}

export class ServerMonitor {
  private latest: DetectedServer[] = [];
  private lastSignature = "";
  private hasScanned = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private inflight: Promise<DetectedServer[]> | null = null;

  constructor(
    private readonly db: Database.Database,
    private readonly registry: StreamRegistry,
  ) {}

  /** Latest snapshot. Empty until the first scan completes. */
  getLatest(): DetectedServer[] {
    return this.latest;
  }

  /** Has at least one scan finished? Lets routes force a fresh scan if not. */
  get ready(): boolean {
    return this.hasScanned;
  }

  /**
   * Scan now, reconcile, store, and broadcast on change. Never throws.
   * Concurrent callers COALESCE onto the single in-flight scan (and await its
   * fresh result) rather than getting back the stale snapshot — so a user-forced
   * `POST /api/servers/scan` landing during the periodic scan still returns
   * up-to-date data instead of the pre-scan (possibly empty) list.
   */
  scanNow(): Promise<DetectedServer[]> {
    if (this.inflight) {
      return this.inflight;
    }
    this.inflight = this.runScan();
    void this.inflight.finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async runScan(): Promise<DetectedServer[]> {
    try {
      const detected = await scanListening();
      let registered: RegisteredServer[] = [];
      try {
        registered = listRegistered(this.db);
      } catch (err) {
        process.stderr.write(
          `[servers/monitor] listRegistered failed: ${describe(err)}\n`,
        );
      }
      const reconciled = reconcile(detected, registered);
      this.latest = reconciled;
      this.hasScanned = true;

      const nextSignature = signature(reconciled);
      if (nextSignature !== this.lastSignature) {
        this.lastSignature = nextSignature;
        this.registry.broadcast({ type: "servers", servers: reconciled });
      }
      return reconciled;
    } catch (err) {
      process.stderr.write(`[servers/monitor] scan failed: ${describe(err)}\n`);
      return this.latest;
    }
  }

  /** Scan immediately, then every SERVER_SCAN_INTERVAL_MS. Safe to call once. */
  start(): void {
    if (this.timer) {
      return;
    }
    void this.scanNow();
    this.timer = setInterval(() => {
      void this.scanNow();
    }, SERVER_SCAN_INTERVAL_MS);
    // Don't keep the process alive solely for the scan timer.
    this.timer.unref?.();
  }

  /** Stop the scan interval. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

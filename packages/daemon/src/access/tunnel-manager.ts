/**
 * TunnelManager — a daemon-owned, long-lived Cloudflare quick tunnel.
 *
 * Unlike the foreground `mc tunnel` CLI (which blocks a shell until Ctrl+C),
 * this is injected into the HTTP app so the "Access from anywhere" panel can
 * start/stop a public tunnel from the dashboard. The UI polls GET /api/access
 * for status, so we do NOT broadcast over the WS registry — the shared wire
 * types stay unchanged.
 *
 * SECURITY: a public tunnel exposes a shell-capable dashboard to the internet.
 * The daemon tears the tunnel down on shutdown (server.ts) so it never outlives
 * the process. The route layer owns the user-facing warning + confirmation.
 *
 * This class NEVER throws: spawn/parse failures set state:"error" with a message.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createInterface } from "node:readline";

import { parseTunnelUrl, quickTunnelArgs } from "../cli/cloudflared.js";

/**
 * How long to wait for cloudflared to emit a public URL before declaring the
 * start a failure. On networks that block Cloudflare's tunnel edge (QUIC/UDP
 * 7844, or the trycloudflare registration endpoint), cloudflared hangs at
 * "Requesting new quick Tunnel..." indefinitely — without this, the UI would
 * sit on "starting" forever.
 */
const TUNNEL_START_TIMEOUT_MS = 35_000;

export type TunnelState = "off" | "starting" | "on" | "error";

export interface TunnelStatus {
  readonly state: TunnelState;
  /** The bare https://*.trycloudflare.com origin once assigned (no token). */
  readonly url: string | null;
  /** A human-readable reason when state is "error". */
  readonly error: string | null;
}

export class TunnelManager {
  private state: TunnelState = "off";
  private url: string | null = null;
  private error: string | null = null;
  private child: ChildProcess | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;

  /** A snapshot of the current tunnel status (immutable copy). */
  status(): TunnelStatus {
    return { state: this.state, url: this.url, error: this.error };
  }

  /**
   * Start a quick tunnel pointed at the local daemon port. Idempotent: if a
   * tunnel is already starting/on, returns the current status unchanged. The
   * URL is parsed asynchronously from cloudflared's output; callers should poll
   * status() (the dashboard does this via GET /api/access). Never throws.
   */
  start(port: number): TunnelStatus {
    if (this.state === "starting" || this.state === "on") {
      return this.status();
    }

    this.state = "starting";
    this.url = null;
    this.error = null;

    let child: ChildProcess;
    try {
      child = spawn("cloudflared", quickTunnelArgs(port), {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      this.fail(`failed to launch cloudflared: ${describe(err)}`);
      return this.status();
    }
    this.child = child;

    // cloudflared prints the URL banner to stderr; watch both streams.
    for (const stream of [child.stdout, child.stderr]) {
      if (!stream) {
        continue;
      }
      const rl = createInterface({ input: stream });
      rl.on("line", (line) => this.onLine(line));
    }

    child.on("error", (err) => {
      this.fail(`cloudflared error: ${describe(err)}`);
    });

    child.on("close", (code) => {
      // Unexpected exit before/after a URL was assigned.
      if (this.child === child) {
        this.child = null;
        if (this.state !== "off") {
          this.fail(
            `cloudflared exited (code ${code ?? "?"}) before the tunnel was ready`,
          );
        }
      }
    });

    // Fail over if no public URL ever arrives (network blocks the tunnel edge).
    this.startTimer = setTimeout(() => {
      if (this.state === "starting") {
        this.fail(
          "Timed out waiting for a public URL. This network may block Cloudflare tunnels — try Tailscale instead (private, works from anywhere over cellular).",
        );
      }
    }, TUNNEL_START_TIMEOUT_MS);
    if (typeof this.startTimer.unref === "function") {
      this.startTimer.unref();
    }

    return this.status();
  }

  /** Tear down the tunnel and reset to "off". Idempotent. Never throws. */
  stop(): TunnelStatus {
    this.clearStartTimer();
    const child = this.child;
    this.child = null;
    this.state = "off";
    this.url = null;
    this.error = null;
    if (child) {
      try {
        child.kill("SIGTERM");
      } catch {
        // Already dead — nothing to do.
      }
    }
    return this.status();
  }

  /** First trycloudflare URL flips us to "on". */
  private onLine(line: string): void {
    if (this.url) {
      return;
    }
    const url = parseTunnelUrl(line);
    if (!url) {
      return;
    }
    this.clearStartTimer();
    this.url = url;
    this.state = "on";
    this.error = null;
  }

  /** Transition to the error state, killing any child. */
  private fail(message: string): void {
    this.clearStartTimer();
    const child = this.child;
    this.child = null;
    this.state = "error";
    this.url = null;
    this.error = message;
    if (child) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  }

  private clearStartTimer(): void {
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

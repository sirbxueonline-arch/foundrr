/**
 * Shared cloudflared helpers — single source of truth for "is cloudflared on
 * PATH?" and "what's the trycloudflare URL?" so the foreground `mc tunnel` CLI
 * and the daemon's managed TunnelManager don't duplicate spawn/parse logic.
 *
 * No new runtime deps: we shell out to `cloudflared` / `which`|`where` and parse
 * stdout/stderr.
 */
import { spawn } from "node:child_process";

/** Matches the assigned quick-tunnel URL in cloudflared's stdout/stderr. */
export const TRYCLOUDFLARE_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

/** The arg vector for a quick tunnel pointed at a local port. */
export function quickTunnelArgs(port: number): readonly string[] {
  return ["tunnel", "--url", `http://127.0.0.1:${port}`];
}

/**
 * Resolve to the cloudflared executable path if found on PATH, else null.
 * Uses `which` (POSIX) / `where` (Windows). Never throws.
 */
export function findCloudflared(): Promise<string | null> {
  return new Promise((resolve) => {
    const probe = process.platform === "win32" ? "where" : "which";
    let child;
    try {
      child = spawn(probe, ["cloudflared"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      resolve(null);
      return;
    }
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      const first = out.split(/\r?\n/).find((l) => l.trim().length > 0);
      resolve(code === 0 && first ? first.trim() : null);
    });
  });
}

/** True when cloudflared is resolvable on PATH. */
export async function isCloudflaredInstalled(): Promise<boolean> {
  return (await findCloudflared()) !== null;
}

/** Extract the first trycloudflare URL from a log line, or null. */
export function parseTunnelUrl(line: string): string | null {
  const match = TRYCLOUDFLARE_URL.exec(line);
  return match ? match[0] : null;
}

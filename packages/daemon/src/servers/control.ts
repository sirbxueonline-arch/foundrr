/**
 * Process control: stop any detected process, spawn a registered server's
 * command. Cross-platform (Unix signals + Windows taskkill).
 */
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";

import { STOP_POLL_INTERVAL_MS, STOP_SIGKILL_GRACE_MS } from "../constants.js";
import { runDetached, taskkill } from "./platform.js";

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Is the process still alive? `kill(pid, 0)` probes without signalling. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = gone; EPERM = alive but not ours (treat as alive).
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Send a signal, swallowing "process already gone" errors. */
function trySignal(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ESRCH") {
      throw err;
    }
  }
}

/**
 * Stop a process by pid.
 *   Unix:    SIGTERM, then SIGKILL after a grace period if still alive.
 *   Windows: `taskkill /PID <pid> /T /F` (tree, forced).
 * Resolves once the process is gone (or best-effort after the kill attempt).
 */
export async function stopProcess(pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`invalid pid: ${pid}`);
  }

  if (process.platform === "win32") {
    await taskkill(pid);
    return;
  }

  trySignal(pid, "SIGTERM");

  // Poll up to the grace window for a clean exit.
  const deadline = Date.now() + STOP_SIGKILL_GRACE_MS;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) {
      return;
    }
    await delay(STOP_POLL_INTERVAL_MS);
  }

  if (isAlive(pid)) {
    trySignal(pid, "SIGKILL");
  }
}

/**
 * Spawn a registered server's command in `cwd`, fully detached so it outlives
 * the daemon. Returns the child's pid. Throws (caught by the route) if `cwd`
 * is missing or the spawn fails to produce a pid.
 */
export function spawnServer(cwd: string, command: string): number {
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
    throw new Error(`cwd does not exist or is not a directory: ${cwd}`);
  }
  if (command.trim().length === 0) {
    throw new Error("command must not be empty");
  }

  try {
    const child = runDetached(spawn, cwd, command);
    child.unref();
    if (typeof child.pid !== "number") {
      throw new Error("spawn produced no pid");
    }
    return child.pid;
  } catch (err) {
    throw new Error(`failed to spawn server: ${describe(err)}`);
  }
}

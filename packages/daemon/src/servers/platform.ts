/**
 * Platform-specific child_process glue, kept in one small module so control.ts
 * stays readable and the OS branching lives in a single place.
 */
import type { ChildProcess, spawn as SpawnFn } from "node:child_process";
import { promisify } from "node:util";
import { exec } from "node:child_process";

import { SCAN_COMMAND_TIMEOUT_MS } from "../constants.js";

const execAsync = promisify(exec);

/**
 * Spawn a shell command detached with stdio ignored, so it survives the daemon.
 * `spawnFn` is injected for testability; defaults to child_process.spawn.
 */
export function runDetached(
  spawnFn: typeof SpawnFn,
  cwd: string,
  command: string,
): ChildProcess {
  return spawnFn(command, {
    cwd,
    shell: true,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
}

/** Windows: forcibly kill a process tree by pid. Never throws. */
export async function taskkill(pid: number): Promise<void> {
  try {
    await execAsync(`taskkill /PID ${pid} /T /F`, {
      timeout: SCAN_COMMAND_TIMEOUT_MS,
      windowsHide: true,
    });
  } catch (err) {
    // Process may already be gone — surface nothing, the caller treats stop as
    // best-effort once the kill command has run.
    process.stderr.write(
      `[servers/platform] taskkill ${pid} failed: ${
        err instanceof Error ? err.message : String(err)
      }\n`,
    );
  }
}

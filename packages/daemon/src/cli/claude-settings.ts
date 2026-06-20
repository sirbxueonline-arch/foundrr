/**
 * Idempotently merge an OpenTelemetry `"env"` block into ~/.claude/settings.json
 * so Claude Code records token/cost metrics into this daemon automatically.
 *
 * Mirrors the proven pattern in `hooks.ts`:
 *   - back up the existing settings.json first (timestamped),
 *   - merge (never clobber) — preserve enabledPlugins, hooks, and any existing
 *     env keys the user already set,
 *   - write valid 2-space JSON,
 *   - tolerate a missing file (treat as `{}`).
 *
 * It NEVER throws uncaught: on any failure it falls back to printing the env
 * block plus a clear message so the user can apply it by hand.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { color, dim, err, ok } from "./util.js";

/** Absolute path of the Claude Code settings file we merge into. */
export function claudeSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

/** Read settings.json as an object, tolerating a missing or malformed file. */
function readSettings(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    return {};
  }
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return typeof parsed === "object" && parsed !== null
    ? (parsed as Record<string, unknown>)
    : {};
}

/** Back up an existing settings.json next to itself (timestamped). */
function backupSettings(path: string, quiet: boolean): void {
  if (!existsSync(path)) {
    return;
  }
  const backup = `${path}.bak-${Date.now()}`;
  writeFileSync(backup, readFileSync(path));
  if (!quiet) {
    dim(`backed up existing settings to ${backup}`);
  }
}

/**
 * Merge `env` into an existing settings object WITHOUT clobbering: existing keys
 * (enabledPlugins, hooks, any prior env keys the user set) are preserved. Our
 * keys win only for the OTel vars we own. Returns the new object + whether it
 * changed anything (so callers can report "already enabled" vs "enabled").
 */
function mergeEnv(
  settings: Record<string, unknown>,
  env: Record<string, string>,
): { next: Record<string, unknown>; changed: boolean } {
  const existingEnv =
    typeof settings["env"] === "object" && settings["env"] !== null
      ? (settings["env"] as Record<string, unknown>)
      : {};

  let changed = false;
  for (const [key, value] of Object.entries(env)) {
    if (existingEnv[key] !== value) {
      changed = true;
    }
  }

  const next = { ...settings, env: { ...existingEnv, ...env } };
  return { next, changed };
}

/** Print the env block as a paste-ready JSON snippet (manual fallback). */
function printEnvBlock(env: Record<string, string>): void {
  const jsonBlock = JSON.stringify({ env }, null, 2)
    .split("\n")
    .map((l) => `      ${l}`)
    .join("\n");
  process.stdout.write(`${color.dim(jsonBlock)}\n`);
}

/** Outcome of a {@link writeTelemetryEnv} call, for callers that want detail. */
export type TelemetryWriteResult = "wrote" | "unchanged" | "failed";

/**
 * Idempotently write the OTel `env` block into ~/.claude/settings.json.
 *
 * Safe to re-run: a second run detects the keys are already present and reports
 * "no changes" instead of duplicating anything. Never throws — on any failure
 * it prints the block + a clear message and returns `"failed"`.
 *
 * Pass `quiet: true` to suppress this function's own status chatter (used by the
 * `mc start` auto-on path, which prints a single banner line of its own). The
 * manual-fallback block is still printed on failure even when quiet, so a broken
 * settings file is never silently swallowed.
 *
 * @returns `"wrote"` if it changed the file, `"unchanged"` if already wired up,
 *          `"failed"` if it had to fall back to printing.
 */
export function writeTelemetryEnv(
  env: Record<string, string>,
  options: { quiet?: boolean } = {},
): TelemetryWriteResult {
  const quiet = options.quiet ?? false;
  const path = claudeSettingsPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    const settings = readSettings(path);
    backupSettings(path, quiet);

    const { next, changed } = mergeEnv(settings, env);
    if (!changed) {
      if (!quiet) {
        ok(`Token recording already enabled in ${path} (no changes).`);
      }
      return "unchanged";
    }

    writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
    if (!quiet) {
      ok(`Enabled token recording in ${path} (restart Claude Code to apply).`);
    }
    return "wrote";
  } catch (e) {
    err(
      `could not write token recording env to ${path}: ` +
        `${e instanceof Error ? e.message : String(e)}`,
    );
    dim("Add this block to ~/.claude/settings.json by hand instead:");
    printEnvBlock(env);
    return "failed";
  }
}

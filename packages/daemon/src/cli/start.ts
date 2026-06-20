/**
 * `mc start` — load config, start the daemon, print a boxed banner with the
 * dashboard URL, and stay alive until SIGINT/SIGTERM.
 */
import { loadConfig } from "../config.js";
import type { Config } from "../config.js";
import { openDb } from "../db/index.js";
import { getSettings } from "../db/settings-repo.js";
import { startDaemon } from "../server.js";
import { claudeSettingsPath, writeTelemetryEnv } from "./claude-settings.js";
import { telemetryEnv } from "./telemetry.js";
import { color, dim, warn } from "./util.js";

/** Opt-out guard: set MC_NO_AUTO_TELEMETRY=1 to skip the startup auto-write. */
function autoTelemetryDisabled(): boolean {
  const raw = process.env["MC_NO_AUTO_TELEMETRY"];
  if (!raw) {
    return false;
  }
  const v = raw.trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false" && v !== "no";
}

/**
 * Auto-enable token recording on startup so the user never needs a separate
 * `mc setup` / `mc telemetry enable --write`. Idempotent (no-op after the first
 * run) and never fatal: on any failure we log a soft note and keep the daemon
 * running. Returns the one-line banner string to print, or `null` when skipped.
 */
function autoEnableTelemetry(config: Config): string | null {
  if (autoTelemetryDisabled()) {
    return null;
  }
  try {
    const result = writeTelemetryEnv(telemetryEnv(config.port), { quiet: true });
    if (result === "failed") {
      // writeTelemetryEnv already printed the manual-paste fallback.
      return null;
    }
    return (
      `${color.green("✓")} ${color.dim(
        `Token recording is on (OTel env in ${claudeSettingsPath()}). ` +
          "Restart Claude Code if it isn't recording yet.",
      )}`
    );
  } catch (e) {
    // Defensive: writeTelemetryEnv shouldn't throw, but never crash startup.
    warn(
      `could not enable token recording (continuing anyway): ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return null;
  }
}

/**
 * One-line disclosure of the anonymous usage-sharing state, reflecting the
 * persisted setting. Always shown at startup so the user knows what's shared and
 * how to opt out. We open the db read-only-ish (just to read the flag) and close
 * it again; the daemon opens its own handle.
 */
function sharingDisclosure(dbPath: string): string {
  let share = true;
  let model = "claude-code";
  try {
    const db = openDb(dbPath);
    try {
      const settings = getSettings(db);
      share = settings.telemetryShare;
      model = settings.model;
    } finally {
      db.close();
    }
  } catch {
    // Fall back to the on-by-default disclosure if the db can't be read.
  }

  if (share) {
    return (
      `${color.dim("Anonymous usage sharing:")} ${color.green("ON")} ` +
      color.dim(
        `(install id + model [${model}] + token/cost only — never code, paths, or prompts). ` +
          "Opt out: mc telemetry share off",
      )
    );
  }
  return (
    `${color.dim("Anonymous usage sharing:")} ${color.yellow("OFF")} ` +
    color.dim("(nothing reported). Opt in: mc telemetry share on")
  );
}

function box(lines: string[]): string {
  const width = lines.reduce((max, l) => Math.max(max, stripAnsi(l).length), 0);
  const top = `+${"-".repeat(width + 2)}+`;
  const body = lines
    .map((l) => {
      const pad = width - stripAnsi(l).length;
      return `| ${l}${" ".repeat(pad)} |`;
    })
    .join("\n");
  return `${top}\n${body}\n${top}`;
}

function stripAnsi(s: string): string {
  // Remove ANSI SGR sequences for width math.
  const esc = String.fromCharCode(27);
  const pattern = new RegExp(`${esc}\\[[0-9;]*m`, "g");
  return s.replace(pattern, "");
}

export async function runStart(): Promise<void> {
  const config = loadConfig();

  // Auto-enable token recording BEFORE starting the daemon so the one-liner sits
  // with the rest of the banner. Idempotent + never fatal; returns null if it was
  // skipped (opt-out) or it printed its own fallback.
  const telemetryLine = autoEnableTelemetry(config);

  const daemon = await startDaemon(config);

  const banner = box([
    color.bold("Mission Control"),
    "",
    `Dashboard: ${color.cyan(daemon.url)}`,
    color.dim("Press Ctrl+C to stop."),
  ]);
  process.stdout.write(`\n${banner}\n\n`);
  dim(`Listening on ${config.host}:${config.port} — home: ${config.home}`);
  if (telemetryLine) {
    process.stdout.write(`${telemetryLine}\n`);
  }
  process.stdout.write(`${sharingDisclosure(config.dbPath)}\n`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    process.stdout.write(`\nReceived ${signal}, shutting down...\n`);
    try {
      await daemon.close();
    } catch {
      // best effort
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // Keep the process alive (the HTTP server already holds the loop, but be safe).
  await new Promise<void>(() => {
    /* never resolves; exit via signal handlers */
  });
}

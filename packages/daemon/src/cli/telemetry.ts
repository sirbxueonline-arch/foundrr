/**
 * `mc telemetry enable` — print a ready-to-use OpenTelemetry env block that
 * points Claude Code's OTLP exporter at this daemon's /v1/metrics receiver.
 *
 * Plain `mc telemetry enable` ONLY prints (back-compat) — the user decides where
 * these vars live. `mc telemetry enable --write` (or `-w`) ALSO writes them into
 * ~/.claude/settings.json under an "env" block (backed up + merged idempotently)
 * so token recording turns on with no manual paste. The two safe options are:
 *   1. ~/.claude/settings.json under an "env": { ... } block (Claude Code reads it).
 *   2. exported in the user's shell profile.
 */
import { loadConfig } from "../config.js";
import { OTEL_EXPORT_INTERVAL_MS } from "../constants.js";
import { openDb } from "../db/index.js";
import { getSettings, setTelemetryShare } from "../db/settings-repo.js";
import { resolveInstallId } from "../telemetry/install-id.js";
import { writeTelemetryEnv } from "./claude-settings.js";
import { color, dim, err, ok } from "./util.js";

/** The OTLP env vars Claude Code needs, given the daemon's port. */
export function telemetryEnv(port: number): Record<string, string> {
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: "1",
    OTEL_METRICS_EXPORTER: "otlp",
    OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
    // Base endpoint — Claude Code appends /v1/metrics itself.
    OTEL_EXPORTER_OTLP_ENDPOINT: `http://localhost:${port}`,
    OTEL_METRIC_EXPORT_INTERVAL: String(OTEL_EXPORT_INTERVAL_MS),
  };
}

const USAGE =
  "usage: mc telemetry enable [--write|-w] | mc telemetry share on|off|status\n";

/**
 * `mc telemetry share <on|off|status>` — control anonymous global usage
 * sharing. ON by default; opting out is a single persisted flag.
 */
function runShare(arg: string | undefined): void {
  const config = loadConfig();

  if (arg === "on" || arg === "off") {
    const db = openDb(config.dbPath);
    try {
      setTelemetryShare(db, arg === "on");
    } finally {
      db.close();
    }
    if (arg === "on") {
      ok("Anonymous usage sharing is ON.");
      dim(
        "Shared: anonymous install id + model + token/cost deltas. Never code, paths, or prompts.",
      );
    } else {
      ok("Anonymous usage sharing is OFF. Nothing will be reported.");
    }
    process.stdout.write("\n");
    return;
  }

  if (arg === undefined || arg === "status") {
    const db = openDb(config.dbPath);
    let settings;
    try {
      settings = getSettings(db);
    } finally {
      db.close();
    }
    const installId = resolveInstallId(config.home);

    process.stdout.write(`\n${color.bold("Mission Control — usage sharing")}\n\n`);
    process.stdout.write(
      `  Sharing  : ${settings.telemetryShare ? color.green("ON") : color.red("OFF")}\n`,
    );
    process.stdout.write(`  Install id: ${color.dim(installId)}\n`);
    process.stdout.write(`  Model    : ${color.cyan(settings.model)}\n\n`);
    dim(
      settings.telemetryShare
        ? "Opt out any time: mc telemetry share off"
        : "Opt back in any time: mc telemetry share on",
    );
    dim("Only the install id + model + token/cost totals are shared — never code.");
    process.stdout.write("\n");
    return;
  }

  err(`unknown share argument: ${arg}`);
  process.stdout.write(USAGE);
  process.exitCode = 1;
}

export function runTelemetry(sub: string | undefined, arg?: string): void {
  if (sub === "share") {
    runShare(arg);
    return;
  }

  if (sub !== "enable" && sub !== undefined) {
    process.stdout.write(`unknown telemetry subcommand: ${sub}\n`);
    process.stdout.write(USAGE);
    process.exitCode = 1;
    return;
  }

  const wantsWrite = arg === "--write" || arg === "-w";
  if (arg !== undefined && !wantsWrite) {
    process.stdout.write(`unknown telemetry enable flag: ${arg}\n`);
    process.stdout.write(USAGE);
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  const env = telemetryEnv(config.port);

  process.stdout.write(`\n${color.bold("Mission Control — telemetry")}\n\n`);
  dim("Point Claude Code's OpenTelemetry exporter at this daemon:");
  process.stdout.write("\n");

  // Plain KEY=VALUE block (no color) so it pastes cleanly into a shell profile.
  for (const [key, value] of Object.entries(env)) {
    process.stdout.write(`${key}=${value}\n`);
  }

  process.stdout.write("\n");

  // --write: do the wiring for the user (idempotent, backed up). Plain enable
  // stays print-only for back-compat.
  if (wantsWrite) {
    writeTelemetryEnv(env);
    process.stdout.write("\n");
    dim(
      `Metrics appear within ~${OTEL_EXPORT_INTERVAL_MS / 1000}s of the next Claude Code activity.`,
    );
    dim("Run the daemon (mc start) so /v1/metrics is listening to receive them.");
    process.stdout.write("\n");
    return;
  }

  dim("How to apply (pick one — or re-run with --write to do option 1 for you):");
  process.stdout.write(
    `  ${color.cyan("•")} Add them to ${color.bold("~/.claude/settings.json")} under an "env" block:\n`,
  );
  const jsonBlock = JSON.stringify({ env }, null, 2)
    .split("\n")
    .map((l) => `      ${l}`)
    .join("\n");
  process.stdout.write(`${color.dim(jsonBlock)}\n`);
  process.stdout.write(
    `  ${color.cyan("•")} Or export them in your shell profile (~/.zshrc, ~/.bashrc).\n`,
  );
  process.stdout.write("\n");
  dim(
    `Metrics appear within ~${OTEL_EXPORT_INTERVAL_MS / 1000}s of the next Claude Code activity.`,
  );
  dim("Run the daemon (mc start) so /v1/metrics is listening to receive them.");
  process.stdout.write("\n");
}

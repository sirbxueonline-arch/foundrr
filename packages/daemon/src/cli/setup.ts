/**
 * `mc setup` — a guided, idempotent first-run that gets a fresh install ready
 * in one command. It runs the unavoidable steps in order (home dir + token,
 * hooks install) and then prints the dashboard URL plus a clearly listed set of
 * optional follow-ups (model picker, Telegram leash, cost telemetry).
 *
 * Design notes:
 *   - SAFE TO RE-RUN. Every step it performs is itself idempotent: loadConfig()
 *     reuses an existing token, and runHooksInstall() backs up + merges without
 *     duplicating entries. Re-running just reprints the current state.
 *   - It CALLS existing helpers; it never duplicates their logic. The hooks step
 *     is `runHooksInstall()`; the URL shape is `localDashboardUrl()`; the
 *     model/telegram state is read straight from the settings repo.
 *   - It does NOT prompt on stdin (clarity over cleverness). For the optional
 *     steps it prints the exact command to run, so the path forward is obvious
 *     whether or not a TTY is attached.
 */
import { loadConfig } from "../config.js";
import { openDb } from "../db/index.js";
import { getSettings } from "../db/settings-repo.js";
import { modelByKey } from "@mission-control/shared";
import { localDashboardUrl } from "./dashboard-url.js";
import { runHooksInstall } from "./hooks.js";
import { color, dim, ok } from "./util.js";

/** The shared Founder Telegram bot every install can link to (no BotFather). */
const SHARED_BOT_USERNAME = "foundrremotebot";

/** Print a numbered section heading so the ordered steps read as a checklist. */
function step(n: number, title: string): void {
  process.stdout.write(`\n${color.bold(`${n}. ${title}`)}\n`);
}

/** Read the model + telegram mode for the summary, tolerating a fresh db. */
function readState(dbPath: string): { model: string; telegramMode: string } {
  try {
    const db = openDb(dbPath);
    try {
      const settings = getSettings(db);
      return { model: settings.model, telegramMode: settings.telegramMode };
    } finally {
      db.close();
    }
  } catch {
    // A brand-new install may not have a materialized db yet — that's fine.
    return { model: "claude-code", telegramMode: "shared" };
  }
}

export function runSetup(): void {
  process.stdout.write(`\n${color.bold("Mission Control — setup")}\n`);
  dim("Guided first-run. Safe to re-run any time — every step is idempotent.\n");

  // 1. Home dir + token. loadConfig() creates ~/.mission-control and persists a
  //    0600 token on first run, and reuses both on every later run.
  step(1, "Home dir + access token");
  const config = loadConfig();
  ok(`Home: ${config.home}`);
  ok(`Token ready at ${config.home}/token (mode 0600).`);

  // 2. Hooks. Reuse the exact install path (backs up settings.json, merges
  //    idempotently). Prints its own OK/no-changes line.
  step(2, "Claude Code hooks");
  runHooksInstall();

  // 3. Dashboard URL — the thing the user actually wants.
  step(3, "Open the dashboard");
  const url = localDashboardUrl(config.host, config.port, config.token);
  process.stdout.write(`   URL: ${color.cyan(url)}\n`);
  process.stdout.write(`   Start the daemon, then open it: ${color.bold("mc start")}\n`);

  // 4. Optional follow-ups — printed as exact commands, never prompted.
  const { model, telegramMode } = readState(config.dbPath);
  const modelInfo = modelByKey(model);

  step(4, "Optional follow-ups");
  process.stdout.write(
    `   ${color.cyan("•")} Pick your agent/model (for the leaderboard): ` +
      `${color.bold("mc config model <key>")}\n`,
  );
  dim(
    `     Currently: ${model}${modelInfo ? ` (${modelInfo.name})` : ""} — ` +
      "see all keys with `mc config model show`.",
  );
  process.stdout.write(
    `   ${color.cyan("•")} Link the leash (shared Founder bot ` +
      `${color.bold(`@${SHARED_BOT_USERNAME}`)}): ${color.bold("mc telegram link")}\n`,
  );
  dim(
    `     No BotFather, no token — one bot serves every install. ` +
      `Mode: ${telegramMode}. Approve/deny from your phone.`,
  );
  process.stdout.write(
    `   ${color.cyan("•")} Feed cost/token metrics: ${color.bold("mc telemetry enable")}\n`,
  );
  dim(
    "     Prints an OTel env block to add to ~/.claude/settings.json. " +
      "Anonymous usage sharing is ON by default (opt out: mc telemetry share off).",
  );

  // 5. Closing checklist — what's done vs. what's optional.
  process.stdout.write(`\n${color.bold("Done")}\n`);
  ok("Home dir + access token");
  ok("Claude Code hooks installed");
  process.stdout.write(`\n${color.bold("Optional (run when you want them)")}\n`);
  dim("  • mc config model <key>   — set your agent/model");
  dim("  • mc telegram link        — link the shared leash bot");
  dim("  • mc telemetry enable     — wire up the cost meter");

  process.stdout.write(`\n${color.bold("Next:")} run ${color.cyan("mc start")} and open the URL above.\n\n`);
}

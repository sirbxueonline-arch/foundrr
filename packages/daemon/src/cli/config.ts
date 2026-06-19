/**
 * `mc config` — local daemon preferences that aren't secrets.
 *
 *   mc config model <key>   Set the agent/model you run (used as the telemetry
 *                           'agent' + 'model' value and the leaderboard bucket).
 *   mc config model show    Show the current model + the full list of valid keys.
 *
 * Validates against the shared MODELS registry; on a bad key it lists every
 * valid key so the fix is obvious. Only touches the db (loadConfig + openDb).
 */
import { MODELS, modelByKey } from "@mission-control/shared";

import { loadConfig } from "../config.js";
import { openDb } from "../db/index.js";
import { getSettings, setModel } from "../db/settings-repo.js";
import { color, dim, err, ok } from "./util.js";

function listValidKeys(): void {
  dim("Valid model keys:");
  for (const m of MODELS) {
    process.stdout.write(
      `  ${color.cyan(m.key.padEnd(16))} ${m.name} ${color.dim(`(${m.vendor})`)}\n`,
    );
  }
}

function showModel(): void {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  let current;
  try {
    current = getSettings(db).model;
  } finally {
    db.close();
  }

  const info = modelByKey(current);
  process.stdout.write(`\n${color.bold("Mission Control — model")}\n\n`);
  process.stdout.write(
    `  Current: ${color.green(current)}${info ? ` ${color.dim(`(${info.name} — ${info.vendor})`)}` : ""}\n\n`,
  );
  listValidKeys();
  process.stdout.write("\n");
}

function setModelKey(key: string): void {
  const info = modelByKey(key);
  if (!info) {
    err(`unknown model key: ${key}`);
    process.stdout.write("\n");
    listValidKeys();
    process.stdout.write("\n");
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  const db = openDb(config.dbPath);
  try {
    setModel(db, key);
  } finally {
    db.close();
  }

  ok(`Model set to ${color.bold(info.name)} (${key}).`);
  dim("This is the agent/model reported with anonymous usage sharing.");
  process.stdout.write("\n");
}

export function runConfig(sub: string | undefined, arg: string | undefined): void {
  if (sub !== "model") {
    err(`unknown config subcommand: ${sub ?? "(none)"}`);
    process.stdout.write("usage: mc config model <key> | mc config model show\n");
    process.exitCode = 1;
    return;
  }

  if (!arg || arg === "show") {
    showModel();
    return;
  }
  setModelKey(arg);
}

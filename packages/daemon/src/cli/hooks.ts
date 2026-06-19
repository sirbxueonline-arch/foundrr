/**
 * `mc hooks <print|install>` — emit or install the Claude Code hooks block
 * for ~/.claude/settings.json. The hook script discovers token/URL itself, so
 * the token is never baked into the command.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  buildHooksBlock,
  hookCommand,
  resolveHookScript,
  type HooksBlock,
} from "./hooks-spec.js";
import { dim, err, ok, warn } from "./util.js";

function settingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

interface HookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string; timeout?: number }>;
}

type SettingsHooks = Record<string, HookEntry[]>;

/** Print the paste-ready hooks JSON. */
export function runHooksPrint(): void {
  const scriptPath = resolveHookScript();
  if (!existsSync(scriptPath)) {
    warn(`hook script not built yet at ${scriptPath}`);
  }
  const block = buildHooksBlock(scriptPath);
  const out = { hooks: block };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

function readSettings(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (e) {
    throw new Error(
      `failed to parse ${path}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** True if any entry in the list already references our hook command. */
function alreadyHasCommand(entries: HookEntry[], command: string): boolean {
  return entries.some((entry) =>
    (entry.hooks ?? []).some((h) => h.command === command),
  );
}

/** Merge our block into existing settings.hooks idempotently. Returns count added. */
function mergeHooks(
  existing: SettingsHooks,
  block: HooksBlock,
  command: string,
): { merged: SettingsHooks; added: number } {
  let added = 0;
  const merged: SettingsHooks = { ...existing };

  for (const [event, ourEntries] of Object.entries(block)) {
    if (!ourEntries) {
      continue;
    }
    const current = merged[event] ? [...merged[event]] : [];
    if (alreadyHasCommand(current, command)) {
      continue;
    }
    merged[event] = [...current, ...ourEntries];
    added += ourEntries.length;
  }

  return { merged, added };
}

/** Install (idempotently) our hooks into ~/.claude/settings.json with a backup. */
export function runHooksInstall(): void {
  const scriptPath = resolveHookScript();
  if (!existsSync(scriptPath)) {
    warn(`hook script not built yet at ${scriptPath} (installing anyway)`);
  }

  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });

  const settings = readSettings(path);

  if (existsSync(path)) {
    const backup = `${path}.bak-${Date.now()}`;
    try {
      writeFileSync(backup, readFileSync(path));
      dim(`backed up existing settings to ${backup}`);
    } catch (e) {
      err(`could not back up settings: ${e instanceof Error ? e.message : e}`);
    }
  }

  const command = hookCommand(scriptPath);
  const block = buildHooksBlock(scriptPath);
  const existingHooks =
    typeof settings["hooks"] === "object" && settings["hooks"] !== null
      ? (settings["hooks"] as SettingsHooks)
      : {};

  const { merged, added } = mergeHooks(existingHooks, block, command);
  const next = { ...settings, hooks: merged };

  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);

  if (added === 0) {
    ok(`hooks already installed in ${path} (no changes)`);
  } else {
    ok(`installed ${added} hook entr${added === 1 ? "y" : "ies"} into ${path}`);
  }
}

export function runHooks(sub: string | undefined): void {
  switch (sub) {
    case "print":
      runHooksPrint();
      return;
    case "install":
      runHooksInstall();
      return;
    default:
      process.stdout.write("usage: mc hooks <print|install>\n");
  }
}

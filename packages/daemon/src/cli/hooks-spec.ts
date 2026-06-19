/**
 * Hook block spec — resolves the absolute hook script path and builds the
 * paste-ready hooks object for ~/.claude/settings.json.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { HookEventName } from "@mission-control/shared";

/** Timeout (s) for the fast fire-and-forget notify hooks. */
const NOTIFY_TIMEOUT = 10;
/** Timeout (s) for PreToolUse — room for the Telegram approve round-trip. */
const PRETOOL_TIMEOUT = 120;

/** Matcher for PreToolUse: the tools that can mutate the machine. */
const PRETOOL_MATCHER = "Bash|Write|Edit|MultiEdit|NotebookEdit";

interface HookCommand {
  type: "command";
  command: string;
  timeout: number;
}

interface HookMatcher {
  matcher: string;
  hooks: HookCommand[];
}

export type HooksBlock = Partial<Record<HookEventName, HookMatcher[]>>;

/**
 * Resolve the absolute path to the compiled hook script.
 * Compiled location: packages/daemon/dist/cli/hooks-spec.js
 *   dist/cli → dist → daemon → packages → packages/hook/dist/hook.mjs
 */
export function resolveHookScript(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const packagesDir = join(here, "..", "..", "..");
  return join(packagesDir, "hook", "dist", "hook.mjs");
}

/** Build the `command` string for a hook entry. */
export function hookCommand(scriptPath: string): string {
  return `node "${scriptPath}"`;
}

const NOTIFY_EVENTS: HookEventName[] = [
  "SessionStart",
  "UserPromptSubmit",
  "PostToolUse",
  "Notification",
  "Stop",
  "SubagentStop",
  "SessionEnd",
];

/** Build the full hooks block keyed by event name. */
export function buildHooksBlock(scriptPath: string): HooksBlock {
  const command = hookCommand(scriptPath);
  const block: HooksBlock = {};

  for (const event of NOTIFY_EVENTS) {
    block[event] = [
      {
        matcher: "*",
        hooks: [{ type: "command", command, timeout: NOTIFY_TIMEOUT }],
      },
    ];
  }

  block["PreToolUse"] = [
    {
      matcher: PRETOOL_MATCHER,
      hooks: [{ type: "command", command, timeout: PRETOOL_TIMEOUT }],
    },
  ];

  return block;
}

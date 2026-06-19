/**
 * Approval gating policy — decides which PreToolUse calls require remote
 * approval, and builds the human-readable summary/detail shown on Telegram and
 * in the dashboard.
 *
 * DEFAULT POLICY ("Everything", the user's choice): gate every Bash command and
 * every file-mutation tool (Write / Edit / MultiEdit / NotebookEdit). Read-only
 * tools (Read, Grep, Glob, WebFetch, …) are NEVER gated — prompting on reads is
 * pure noise and would train the user to reflexively tap Approve.
 *
 * The gated set is a named constant so a future "configurable policy" milestone
 * can swap it (or read it from the db) without touching call sites.
 */
import { basename } from "node:path";

import { bashCommand, EDIT_TOOLS, filePath } from "@mission-control/shared";

import { LABEL_MAX } from "../constants.js";

/** Tools whose calls are gated for remote approval. */
export const GATED_TOOLS: ReadonlySet<string> = new Set<string>([
  "Bash",
  ...EDIT_TOOLS,
]);

/** Max chars of a non-Bash/non-edit tool_input dump used as the detail line. */
const DETAIL_JSON_MAX = 200;

export interface GateResult {
  /** Whether this tool call must be routed for remote approval. */
  readonly gated: boolean;
  /** Short, human-readable summary, e.g. "Run command" / "Edit foo.ts". */
  readonly summary: string;
  /** The Bash command, file path, or truncated input that triggered the gate. */
  readonly detail: string;
}

/**
 * Decide whether a PreToolUse call is gated and describe it. `toolInput` is
 * untrusted external data, so every field access is defensive.
 */
export function isGated(
  toolName: string | undefined,
  toolInput: Record<string, unknown> | undefined,
): GateResult {
  const tool = typeof toolName === "string" ? toolName : "";

  if (!GATED_TOOLS.has(tool)) {
    return { gated: false, summary: tool || "tool", detail: "" };
  }

  if (tool === "Bash") {
    const cmd = bashCommand(toolInput);
    return {
      gated: true,
      summary: "Run command",
      detail: cmd ?? "(no command)",
    };
  }

  // One of the file-mutation tools.
  const fp = filePath(toolInput);
  if (fp) {
    return {
      gated: true,
      summary: `Edit ${basename(fp)}`,
      detail: fp,
    };
  }

  // Edit-family tool without a recognizable file_path (e.g. NotebookEdit shapes
  // we don't model). Still gate it — fall back to a generic summary + dump.
  return {
    gated: true,
    summary: `Edit (${tool})`,
    detail: safeJson(toolInput),
  };
}

/** JSON.stringify that never throws and is capped for display. */
function safeJson(input: Record<string, unknown> | undefined): string {
  if (!input) {
    return "(no input)";
  }
  let json: string;
  try {
    json = JSON.stringify(input);
  } catch {
    return "(uninspectable input)";
  }
  return json.length > DETAIL_JSON_MAX
    ? `${json.slice(0, DETAIL_JSON_MAX - 1)}…`
    : json;
}

/** Re-exported for callers that want the label cap for further truncation. */
export const SUMMARY_MAX = LABEL_MAX;

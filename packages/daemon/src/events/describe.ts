/**
 * Pure helpers for turning tool calls into human-readable activity labels.
 */
import { basename } from "node:path";

import {
  bashCommand,
  EDIT_TOOLS,
  filePath,
  type IncomingHookEvent,
} from "@mission-control/shared";

import { LABEL_MAX } from "../constants.js";

const EDIT_TOOL_SET: ReadonlySet<string> = new Set<string>(EDIT_TOOLS);

/** True if the tool name is one of the file-editing tools. */
export function isEditTool(tool: string | undefined): boolean {
  return tool !== undefined && EDIT_TOOL_SET.has(tool);
}

/** Truncate a string to `n` chars, appending an ellipsis when cut. */
export function truncate(s: string, n: number = LABEL_MAX): string {
  const trimmed = s.replace(/\s+/g, " ").trim();
  if (trimmed.length <= n) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, n - 1))}…`;
}

/** Project name = basename(cwd), or "unknown" when cwd is absent. */
export function projectFromCwd(cwd: string | undefined): string {
  if (!cwd || cwd.trim().length === 0) {
    return "unknown";
  }
  const base = basename(cwd);
  return base.length > 0 ? base : "unknown";
}

/**
 * Describe a PreToolUse activity:
 *   - Edit tools with a file_path → "Editing <file>"
 *   - Bash with a command       → "Running: <cmd>"
 *   - otherwise                 → the bare tool name
 */
export function describeTool(ev: IncomingHookEvent): string {
  const tool = ev.tool_name ?? "tool";
  if (isEditTool(tool)) {
    const fp = filePath(ev.tool_input);
    return fp ? `Editing ${truncate(fp)}` : `Editing (${tool})`;
  }
  if (tool === "Bash") {
    const cmd = bashCommand(ev.tool_input);
    return cmd ? `Running: ${truncate(cmd)}` : "Running command";
  }
  return tool;
}

/** Best-effort target string for a tool activity (file path or command). */
export function toolTarget(ev: IncomingHookEvent): string | undefined {
  if (ev.tool_name === "Bash") {
    return bashCommand(ev.tool_input);
  }
  return filePath(ev.tool_input);
}

/**
 * Claude Code hook events as received by the daemon's POST /events endpoint.
 *
 * The hook script forwards the raw hook JSON (read from stdin) verbatim, so these
 * field names mirror Claude Code's hook payload schema exactly. Verified against
 * https://code.claude.com/docs/en/hooks — keep this file as the single source of
 * truth for the wire shape and validate every incoming payload against it.
 */

export type HookEventName =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "Notification"
  | "Stop"
  | "SubagentStop"
  | "SessionEnd"
  | "PreCompact";

export type PermissionMode =
  | "default"
  | "plan"
  | "acceptEdits"
  | "bypassPermissions";

/** Tools whose PostToolUse counts as a file edit (for the filesEdited stat). */
export const EDIT_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"] as const;

/**
 * Permissive shape for an incoming hook event. Only `session_id` and
 * `hook_event_name` are guaranteed; everything else is event-specific and
 * optional. Validate at the boundary, never trust shape.
 */
export interface IncomingHookEvent {
  session_id: string;
  hook_event_name: HookEventName;
  transcript_path?: string;
  cwd?: string;
  permission_mode?: PermissionMode | string;
  /** SessionStart: "startup" | "resume" | "clear" | "compact" */
  source?: string;
  /** UserPromptSubmit */
  prompt?: string;
  /** Pre/PostToolUse */
  tool_name?: string;
  /** Pre/PostToolUse — tool-specific. Bash: {command}; Edit/Write: {file_path}. */
  tool_input?: Record<string, unknown>;
  /** PostToolUse */
  tool_response?: unknown;
  /** Notification */
  message?: string;
  /** SessionEnd: "clear" | "logout" | "prompt_input_exit" | other */
  reason?: string;
  /** Stop / SubagentStop loop guard */
  stop_hook_active?: boolean;
  /** PreCompact: "manual" | "auto" */
  trigger?: string;
}

/** Extract the Bash command from a tool_input, if present. */
export function bashCommand(input: Record<string, unknown> | undefined): string | undefined {
  const cmd = input?.["command"];
  return typeof cmd === "string" ? cmd : undefined;
}

/** Extract a file_path from a tool_input, if present. */
export function filePath(input: Record<string, unknown> | undefined): string | undefined {
  const fp = input?.["file_path"];
  return typeof fp === "string" ? fp : undefined;
}

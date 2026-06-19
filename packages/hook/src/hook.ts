/**
 * Mission Control — Claude Code hook bridge.
 *
 * This is the single most safety-critical file in the project. It is wired to
 * EVERY Claude Code hook event and runs inside the user's live coding session.
 * It therefore obeys one absolute rule:
 *
 *   IT MUST NEVER BLOCK, HANG, THROW, OR CRASH CLAUDE CODE.
 *
 * ----------------------------------------------------------------------------
 * Fail-open philosophy
 * ----------------------------------------------------------------------------
 * "Fail open" here means: when anything goes wrong (Mission Control daemon is
 * down, slow, returns garbage, the network stalls, stdin is unparseable, an
 * exception is thrown, the overall budget is exhausted) we DEFER to Claude
 * Code's normal local permission prompt. We never silently allow and we never
 * hang. A broken or absent Mission Control must be indistinguishable from "no
 * hook installed" from Claude Code's point of view.
 *
 * The mechanism for deferring is simply: exit 0 with NOTHING on stdout.
 *
 * ----------------------------------------------------------------------------
 * Verified PreToolUse decision contract (confirmed against current docs)
 * ----------------------------------------------------------------------------
 * A PreToolUse hook returns a decision via exit code 0 + JSON on stdout:
 *
 *   {
 *     "hookSpecificOutput": {
 *       "hookEventName": "PreToolUse",
 *       "permissionDecision": "allow" | "deny",
 *       "permissionDecisionReason": "..."
 *     }
 *   }
 *
 * - `hookEventName` MUST be exactly "PreToolUse".
 * - `permissionDecision` is "allow" or "deny" only.
 * - We do NOT use exit code 2, and we do NOT use the deprecated top-level
 *   `{ "decision": ... }` shape.
 * - Exit 0 with NO stdout = "defer to the normal local permission prompt".
 *   This is our fail-open / timeout behaviour: it never silently allows and
 *   never hangs.
 *
 * Zero runtime dependencies: Node built-ins only (node:process, plus the
 * global `fetch` / `AbortController` that exist on Node >= 18). esbuild bundles
 * this to a single dist/hook.mjs; the only imported symbols are TYPES, which
 * are erased at build time.
 */

import process from "node:process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Types only — intentionally INLINED rather than imported from
// @mission-control/shared. This keeps the most safety-critical file in the
// project fully self-contained with zero build-order coupling: it must compile
// and bundle even if no other package has been built. The shapes mirror
// @mission-control/shared (the single source of truth for the wire format);
// keep them in sync if that file changes. Only the two fields this bridge
// relies on are guaranteed present — everything else is event-specific.

/** Mirrors @mission-control/shared HookEventName. */
type HookEventName =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "Notification"
  | "Stop"
  | "SubagentStop"
  | "SessionEnd"
  | "PreCompact";

/**
 * Permissive shape for an incoming hook event. Only `session_id` and
 * `hook_event_name` are guaranteed; everything else is optional and untrusted.
 * Mirrors @mission-control/shared IncomingHookEvent (subset used here).
 */
interface IncomingHookEvent {
  session_id: string;
  hook_event_name: HookEventName;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  [key: string]: unknown;
}

// ----------------------------------------------------------------------------
// Tunable constants (all timeouts in milliseconds)
// ----------------------------------------------------------------------------

/** Hard watchdog. Stays comfortably under Claude Code's hook timeout. */
const WATCHDOG_MS = 52_000;

/** Fire-and-forget telemetry POST to /events. */
const EVENTS_POST_TIMEOUT_MS = 1_500;

/** The gate check: should this PreToolUse call be routed for remote approval? */
const EVALUATE_TIMEOUT_MS = 2_000;

/** Each individual poll of /approvals/<id>. */
const POLL_REQUEST_TIMEOUT_MS = 2_000;

/** Delay between successive polls. */
const POLL_INTERVAL_MS = 1_200;

/** Total time we are willing to wait for a remote decision before deferring. */
const POLL_BUDGET_MS = 48_000;

const DEFAULT_MC_URL = "http://127.0.0.1:7878";
const DEFAULT_HOME_DIRNAME = ".mission-control";

const ALLOW_REASON_FALLBACK = "Approved via Mission Control";
const DENY_REASON_FALLBACK = "Denied via Mission Control";

const PRE_TOOL_USE: HookEventName = "PreToolUse";

// ----------------------------------------------------------------------------
// Minimal local types for the daemon wire shapes (no runtime cost)
// ----------------------------------------------------------------------------

type PermissionDecision = "allow" | "deny";

interface EvaluateResponse {
  gated?: boolean;
  requestId?: string;
}

type ApprovalState = "pending" | "allowed" | "denied" | "expired";

interface ApprovalResponse {
  state?: ApprovalState;
  reason?: string;
}

interface HookConfig {
  mcUrl: string;
  token: string;
}

// ----------------------------------------------------------------------------
// Tiny safe helpers
// ----------------------------------------------------------------------------

/**
 * Resolve config from env + token file. Never throws: any failure simply
 * yields an empty token, which is fine — the daemon may reject us and we
 * swallow that.
 */
function resolveConfig(): HookConfig {
  const mcUrl = process.env["MC_URL"]?.trim() || DEFAULT_MC_URL;

  let token = process.env["MC_TOKEN"]?.trim() ?? "";
  if (!token) {
    token = readTokenFile();
  }

  return { mcUrl, token };
}

/** Read <home>/token, trimmed. Returns "" on any problem. */
function readTokenFile(): string {
  try {
    const home = process.env["MC_HOME"]?.trim() || path.join(os.homedir(), DEFAULT_HOME_DIRNAME);
    const tokenPath = path.join(home, "token");
    return fs.readFileSync(tokenPath, "utf8").trim();
  } catch {
    return "";
  }
}

/** Read all of stdin as a single string. Resolves "" if stdin is empty/closed. */
function readStdin(): Promise<string> {
  return new Promise<string>((resolve) => {
    let data = "";
    const stdin = process.stdin;

    // If stdin is a TTY / not piped, there is no event to read — bail fast.
    if (stdin.isTTY) {
      resolve("");
      return;
    }

    stdin.setEncoding("utf8");
    stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    stdin.on("end", () => resolve(data));
    stdin.on("error", () => resolve(data));
  });
}

/** Parse stdin JSON into an event with at least the required fields. */
function parseEvent(raw: string): IncomingHookEvent | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  if (typeof obj["hook_event_name"] !== "string") return null;
  if (typeof obj["session_id"] !== "string") return null;

  return obj as unknown as IncomingHookEvent;
}

/** fetch with a hard AbortController timeout. Caller handles all errors. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function jsonHeaders(token: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-mc-token": token,
  };
}

/**
 * Debug trace to stderr, gated by MC_HOOK_DEBUG. stderr never affects the
 * hook's decision (only stdout carries the permission decision), so this is
 * always safe to leave in. Off by default.
 */
const DEBUG = !!process.env["MC_HOOK_DEBUG"];
function dbg(...parts: unknown[]): void {
  if (!DEBUG) return;
  try {
    process.stderr.write(`[mc-hook] ${parts.map(String).join(" ")}\n`);
  } catch {
    // never let logging break the hook
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    // NOTE: do NOT unref() this timer. During the approval poll loop, the
    // inter-poll sleep is often the only thing on the event loop (the fetch has
    // settled and stdin has ended). An unref'd timer would let Node exit 0
    // mid-poll — silently deferring before the decision arrives. The poll
    // budget (POLL_BUDGET_MS) and the unref'd watchdog already bound total
    // runtime, so keeping this timer ref'd is safe and correct.
    setTimeout(resolve, ms);
  });
}

// ----------------------------------------------------------------------------
// Decision emission (the only thing that writes to stdout)
// ----------------------------------------------------------------------------

/** Emit the verified allow/deny JSON and exit 0. */
function emitDecision(decision: PermissionDecision, reason: string): never {
  const payload = {
    hookSpecificOutput: {
      hookEventName: PRE_TOOL_USE,
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  };
  try {
    // Write SYNCHRONOUSLY to fd 1. process.stdout.write() to a pipe (which is
    // how Claude Code captures hook output) is buffered/async, and a following
    // process.exit(0) truncates it before it flushes — the decision would be
    // lost. fs.writeSync blocks until the bytes are handed to the OS.
    fs.writeSync(1, JSON.stringify(payload));
  } catch {
    // If we cannot even write stdout, the safest thing is to defer.
  }
  process.exit(0);
}

/** Defer to Claude Code's normal local prompt: exit 0 with no stdout. */
function defer(): never {
  process.exit(0);
}

// ----------------------------------------------------------------------------
// Network behaviours
// ----------------------------------------------------------------------------

/**
 * Fire-and-forget telemetry POST to /events. Swallows everything. Returns when
 * the request settles or its timeout fires, so PreToolUse can briefly await it.
 */
async function postEvent(
  cfg: HookConfig,
  event: IncomingHookEvent,
): Promise<void> {
  try {
    await fetchWithTimeout(
      `${cfg.mcUrl}/events`,
      {
        method: "POST",
        headers: jsonHeaders(cfg.token),
        body: JSON.stringify(event),
      },
      EVENTS_POST_TIMEOUT_MS,
    );
  } catch {
    // Telemetry is best-effort; a down/slow daemon must not matter.
  }
}

/**
 * Ask the daemon whether this PreToolUse call should be gated for remote
 * approval. Returns the requestId if gated, otherwise null (defer).
 */
async function evaluateGate(
  cfg: HookConfig,
  event: IncomingHookEvent,
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `${cfg.mcUrl}/approvals/evaluate`,
      {
        method: "POST",
        headers: jsonHeaders(cfg.token),
        body: JSON.stringify({
          sessionId: event.session_id,
          toolName: event.tool_name,
          toolInput: event.tool_input,
          cwd: event.cwd,
        }),
      },
      EVALUATE_TIMEOUT_MS,
    );

    // 404 (endpoint not built yet), 401, 5xx — all mean "not gated, defer".
    if (!res.ok) {
      dbg("evaluate not ok:", res.status);
      return null;
    }

    const body = (await res.json()) as EvaluateResponse;
    dbg("evaluate body:", JSON.stringify(body));
    if (body?.gated !== true) return null;
    if (typeof body.requestId !== "string" || body.requestId.length === 0) {
      return null;
    }
    return body.requestId;
  } catch (e) {
    dbg("evaluate threw:", (e as Error)?.message);
    return null;
  }
}

/**
 * Poll the daemon for a decision until one arrives or the budget is exhausted.
 * NEVER auto-allows on timeout — exhaustion / errors / "expired" all defer.
 */
async function pollForDecision(cfg: HookConfig, requestId: string): Promise<never> {
  const deadline = Date.now() + POLL_BUDGET_MS;
  const url = `${cfg.mcUrl}/approvals/${encodeURIComponent(requestId)}`;

  dbg("polling", requestId);
  while (Date.now() < deadline) {
    try {
      const res = await fetchWithTimeout(
        url,
        { method: "GET", headers: jsonHeaders(cfg.token) },
        POLL_REQUEST_TIMEOUT_MS,
      );

      dbg("poll status:", res.status);
      if (res.ok) {
        const body = (await res.json()) as ApprovalResponse;
        const state = body?.state;
        dbg("poll state:", state);

        if (state === "allowed") {
          emitDecision("allow", body.reason || ALLOW_REASON_FALLBACK);
        }
        if (state === "denied") {
          emitDecision("deny", body.reason || DENY_REASON_FALLBACK);
        }
        if (state === "expired") {
          defer();
        }
        // "pending" or unknown -> keep polling.
      }
      // Non-OK (transient 404/5xx) -> keep polling within budget.
    } catch {
      // Single poll failed; keep trying within the budget.
    }

    await sleep(POLL_INTERVAL_MS);
  }

  // Budget exhausted: never auto-allow, defer to the local prompt.
  defer();
}

// ----------------------------------------------------------------------------
// Main control flow
// ----------------------------------------------------------------------------

async function run(): Promise<void> {
  const cfg = resolveConfig();

  const raw = await readStdin();
  const event = parseEvent(raw);
  if (!event) {
    // Empty / unparseable stdin: nothing to decide, nothing to report.
    defer();
  }

  const isPreToolUse = event.hook_event_name === PRE_TOOL_USE;

  if (!isPreToolUse) {
    // All non-gating events: fire-and-forget telemetry, then exit 0 silently.
    await postEvent(cfg, event);
    defer();
  }

  // PreToolUse — the gate.
  // 1) Still report the event (await briefly, ignore failure).
  await postEvent(cfg, event);

  // 2) Ask whether this call is gated.
  const requestId = await evaluateGate(cfg, event);
  if (requestId === null) {
    // Not gated (or evaluate failed / endpoint absent) -> defer.
    defer();
  }

  // 3) Gated: poll for the remote Approve/Deny decision.
  await pollForDecision(cfg, requestId);
}

// ----------------------------------------------------------------------------
// Bootstrap: hard watchdog + total error containment
// ----------------------------------------------------------------------------

function installWatchdog(): void {
  // If anything stalls, exit 0 cleanly (defer) so Claude Code never hangs.
  const watchdog = setTimeout(() => {
    try {
      defer();
    } catch {
      process.exit(0);
    }
  }, WATCHDOG_MS);
  // Do not let the watchdog itself keep the process alive.
  if (typeof watchdog.unref === "function") watchdog.unref();
}

function main(): void {
  installWatchdog();

  // Last-resort guards: a stray rejection/exception must still exit 0.
  process.on("uncaughtException", () => process.exit(0));
  process.on("unhandledRejection", () => process.exit(0));

  run().catch(() => {
    // On ANY error: exit 0 with no stdout (defer). Never fail loudly.
    process.exit(0);
  });
}

main();

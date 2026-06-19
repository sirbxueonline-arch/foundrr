/**
 * Named constants — no magic numbers scattered through the code.
 */

/** Default HTTP port for the daemon. */
export const DEFAULT_PORT = 7878;

/** Default bind host (loopback only; remote access is opt-in via HOST=0.0.0.0). */
export const DEFAULT_HOST = "127.0.0.1";

/** Length in bytes of a freshly generated access token (hex-encoded → 64 chars). */
export const TOKEN_BYTES = 32;

/** File mode for the persisted token file (owner read/write only). */
export const TOKEN_FILE_MODE = 0o600;

/** File mode for the persisted anonymous install-id file (owner read/write only). */
export const INSTALL_ID_FILE_MODE = 0o600;

/** A session goes idle after this many ms of silence. */
export const IDLE_AFTER_MS = 90_000;

/** How often the idle sweeper runs. */
export const IDLE_SWEEP_INTERVAL_MS = 15_000;

/** Cap on the recent-events ring buffer per session. */
export const RECENT_CAP = 50;

/** Cap on the achievements list per session. */
export const ACHIEVEMENTS_CAP = 30;

/** Default truncation length for human-readable labels. */
export const LABEL_MAX = 80;

/** How many recent events to keep when querying the events table. */
export const EVENTS_QUERY_LIMIT = 100;

// ─── Servers (M2) ────────────────────────────────────────────────────────────

/** How often the server monitor rescans listening ports. */
export const SERVER_SCAN_INTERVAL_MS = 5_000;

/** Grace period between SIGTERM and SIGKILL when stopping a Unix process. */
export const STOP_SIGKILL_GRACE_MS = 3_000;

/** Polling interval while waiting to confirm a process exited. */
export const STOP_POLL_INTERVAL_MS = 200;

/** Hard timeout for any external scan/lookup command (ss, lsof, ps, etc.). */
export const SCAN_COMMAND_TIMEOUT_MS = 4_000;

/** Max chars retained for a process command line before display truncation. */
export const COMMAND_MAX = 512;

// ─── Preview reverse-proxy ───────────────────────────────────────────────────

/**
 * Bind host for preview reverse-proxies. Always 0.0.0.0 so an exposed dev
 * server is reachable over the LAN/Tailscale regardless of the dev server's own
 * (usually 127.0.0.1) bind address — that's the whole point of the proxy.
 */
export const PREVIEW_PROXY_HOST = "0.0.0.0";

/** OS-assigned ephemeral port for a freshly created preview proxy. */
export const PREVIEW_PROXY_EPHEMERAL_PORT = 0;

// ─── Terminal (M3) ─────────────────────────────────────────────────────────

/** Cap on the per-pty scrollback ring buffer, in bytes. Replayed on reconnect. */
export const TERM_SCROLLBACK_MAX = 200_000;

/**
 * Default PTY geometry at spawn — a sane, generous box so a full-screen TUI
 * (e.g. `claude`) renders correctly even before the client's first fit lands.
 * The web client overrides this with the real viewport size on connect.
 */
export const TERM_DEFAULT_COLS = 120;
export const TERM_DEFAULT_ROWS = 30;

/**
 * Floor for an accepted resize. A real terminal is never 1×1; a sub-minimum
 * request is the symptom of a hidden / unlaid-out container (clientWidth 0 →
 * FitAddon clamps cols to 1). We ignore anything below this so a stray tiny
 * resize can never wedge the PTY at one column. Sourced from @mission-control/
 * shared so both ends of the wire enforce the same floor.
 */
export { TERM_MIN_COLS, TERM_MIN_ROWS } from "@mission-control/shared";

// ─── Git (M4) ────────────────────────────────────────────────────────────────

/** Hard timeout for any git invocation. Keeps a wedged repo from hanging. */
export const GIT_CMD_TIMEOUT_MS = 10_000;

/** Max chars of diff output returned to the client; longer diffs are truncated. */
export const GIT_DIFF_MAX = 500_000;

// ─── Cost / telemetry (M5) ─────────────────────────────────────────────────────

/**
 * Debounce window for cost broadcasts. Many datapoints arrive in one OTLP
 * push; coalesce them into a single {type:"cost"} fan-out.
 */
export const COST_BROADCAST_DEBOUNCE_MS = 250;

/**
 * Default OTLP metric export interval suggested to Claude Code (ms). Near-live
 * without hammering the receiver. Surfaced by `mc telemetry enable`.
 */
export const OTEL_EXPORT_INTERVAL_MS = 10_000;

// ─── Global usage sharing (P4) ───────────────────────────────────────────────

/**
 * How often the anonymous telemetry reporter computes a delta and (if non-zero)
 * POSTs it to the global aggregator. ~2 minutes: live enough for the global
 * counters without being chatty.
 */
export const TELEMETRY_REPORT_INTERVAL_MS = 60_000;

/** Hard timeout on the usage-event POST. Telemetry must never block the daemon. */
export const TELEMETRY_REQUEST_TIMEOUT_MS = 5_000;

/**
 * Default base URL of the global aggregator (Supabase). Overridable via
 * MC_SHARE_URL for self-hosting / testing.
 */
export const TELEMETRY_DEFAULT_URL = "https://hmnviltczxxxpzunpnlb.supabase.co";

/**
 * Default publishable (anon) API key for the aggregator. This is a PUBLIC,
 * insert-only key by design — it is meant to ship in the open-source client.
 * Overridable via MC_SHARE_KEY.
 */
export const TELEMETRY_DEFAULT_KEY =
  "sb_publishable_Ur8F6EIn7NuHu2Pe6pnuYA_2FbexIUw";

// ─── Approvals / remote approve (M7) ─────────────────────────────────────────

/**
 * How long a pending approval lives before the sweeper expires it. The hook
 * stops polling at ~48s (POLL_BUDGET_MS in hook.ts), so 50s expiry aligns: the
 * request is marked "expired" just after the hook has already deferred to the
 * local prompt, so a late tap can never resolve a dead request.
 */
export const APPROVAL_TTL_MS = 50_000;

/** How often the approval sweeper checks for expired pending requests. */
export const APPROVAL_SWEEP_INTERVAL_MS = 2_000;

/**
 * Cap on recently-resolved approvals retained in the active list (for the
 * dashboard snapshot). Pending ones are always included.
 */
export const APPROVAL_RECENT_RESOLVED_CAP = 10;

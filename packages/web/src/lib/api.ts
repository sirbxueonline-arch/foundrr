/**
 * Thin REST client for the daemon. Always uses relative URLs so the Vite dev
 * proxy (and the daemon serving the build in prod) route correctly. The token
 * travels as the `x-mc-token` header on every request.
 */
import type {
  AgentSession,
  ApprovalDecision,
  DetectedServer,
  Entitlement,
  GitStatus,
  RegisteredServer,
  RegisterServerBody,
  TerminalTabInfo,
} from "@mission-control/shared";
import { getToken } from "./token";

export const TOKEN_HEADER = "x-mc-token";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "DELETE";

/**
 * Core request helper. Attaches the token header, sends an optional JSON body,
 * and parses a JSON response. Throws `ApiError` on a missing token, a network
 * failure, or a non-2xx response.
 */
async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new ApiError("Missing access token", 401);
  }

  const headers: Record<string, string> = {
    [TOKEN_HEADER]: token,
    accept: "application/json",
  };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : "network error";
    throw new ApiError(`Request failed: ${detail}`, 0);
  }

  if (!res.ok) {
    throw new ApiError(`${method} ${path} → ${res.status}`, res.status);
  }

  // 204 / empty bodies parse to undefined; callers expecting void tolerate it.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * GET a JSON resource from the daemon, attaching the access token header.
 * Throws `ApiError` on a missing token or a non-2xx response.
 */
export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

/** POST a JSON body to the daemon and parse the JSON response. */
export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

/** DELETE a resource on the daemon and parse the JSON response. */
export function apiDelete<T>(path: string): Promise<T> {
  return request<T>("DELETE", path);
}

// ─────────────────────────────────────────────────────────────────────────────
// Agents (M1)
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch the current agent sessions snapshot via REST. */
export function getSessions(): Promise<AgentSession[]> {
  return apiGet<AgentSession[]>("/api/sessions");
}

// ─────────────────────────────────────────────────────────────────────────────
// Servers (M2)
// ─────────────────────────────────────────────────────────────────────────────

/** Currently detected (listening) dev servers. */
export function getServers(): Promise<DetectedServer[]> {
  return apiGet<DetectedServer[]>("/api/servers");
}

/** Force a fresh port scan; returns the newly detected servers. */
export function scanServers(): Promise<DetectedServer[]> {
  return apiPost<DetectedServer[]>("/api/servers/scan");
}

/** Stop any detected process by its pid (SIGTERM→SIGKILL on the daemon). */
export function stopProcess(pid: number): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>(`/api/servers/${pid}/stop`);
}

/** All registered servers (persisted launch recipes). */
export function listRegistered(): Promise<RegisteredServer[]> {
  return apiGet<RegisteredServer[]>("/api/servers/registered");
}

/** Persist a new registered server (name + cwd + command). */
export function registerServer(body: RegisterServerBody): Promise<RegisteredServer> {
  return apiPost<RegisteredServer>("/api/servers/registered", body);
}

/** Start a registered server; resolves with the launched pid. */
export function startRegistered(id: string): Promise<{ ok: true; pid: number }> {
  return apiPost<{ ok: true; pid: number }>(`/api/servers/registered/${id}/start`);
}

/** Stop a registered server's current process. */
export function stopRegistered(id: string): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>(`/api/servers/registered/${id}/stop`);
}

/** Restart a registered server; resolves with the new pid. */
export function restartRegistered(id: string): Promise<{ ok: true; pid: number }> {
  return apiPost<{ ok: true; pid: number }>(`/api/servers/registered/${id}/restart`);
}

/** Remove a registered server recipe. */
export function deleteRegistered(id: string): Promise<{ ok: true }> {
  return apiDelete<{ ok: true }>(`/api/servers/registered/${id}`);
}

/**
 * Expose a (possibly localhost-only) dev server through the path-mounted preview
 * proxy on the main daemon port. Resolves with the same-origin path prefix the
 * preview is served under — `/__preview/<port>/` — so the preview opens at
 * `<dashboard-origin>/__preview/<port>/` (works on LAN http AND https tunnel).
 */
export function exposeServer(port: number): Promise<{ exposed: boolean; prefix: string }> {
  return apiPost<{ exposed: boolean; prefix: string }>(`/api/servers/${port}/expose`);
}

/** Tear down the reverse proxy previously created by {@link exposeServer}. */
export function unexposeServer(port: number): Promise<void> {
  return apiDelete<void>(`/api/servers/${port}/expose`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Terminal (M3)
// ─────────────────────────────────────────────────────────────────────────────

/** List the daemon's currently live terminal sessions (for restore on load). */
export function listTerminals(): Promise<TerminalTabInfo[]> {
  return apiGet<TerminalTabInfo[]>("/api/term");
}

/** Kill a terminal session by id (terminates its PTY on the daemon). */
export function killTerminal(id: string): Promise<{ ok: true }> {
  return apiDelete<{ ok: true }>(`/api/term/${encodeURIComponent(id)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Git (M4)
// ─────────────────────────────────────────────────────────────────────────────

/** Response of `GET /api/git/diff` — a unified diff plus a truncation flag. */
export interface GitDiffResult {
  diff: string;
  truncated: boolean;
}

/** Response of `POST /api/git/commit`. */
export interface GitCommitResult {
  ok: true;
  committed: boolean;
  output: string;
}

/** Options for {@link getGitDiff}: which file (omit = whole tree) and staged vs working. */
export interface GitDiffOptions {
  file?: string;
  staged?: boolean;
}

/**
 * Fetch the working-tree git status for an agent project's `cwd`.
 *
 * The daemon returns 409 (surfaced as an `ApiError`) when `cwd` is not a git
 * repository; callers should treat that as a benign "not a repo" state rather
 * than a hard failure.
 */
export function getGitStatus(cwd: string): Promise<GitStatus> {
  return apiGet<GitStatus>(`/api/git/status?cwd=${encodeURIComponent(cwd)}`);
}

/**
 * Fetch a unified diff for `cwd`. With no `file`, returns the whole-tree diff;
 * `staged` toggles the staged (index) vs working-tree view.
 */
export function getGitDiff(cwd: string, options: GitDiffOptions = {}): Promise<GitDiffResult> {
  const params = new URLSearchParams({ cwd });
  if (options.file !== undefined) params.set("file", options.file);
  if (options.staged !== undefined) params.set("staged", options.staged ? "1" : "0");
  return apiGet<GitDiffResult>(`/api/git/diff?${params.toString()}`);
}

/** Commit the working tree at `cwd` with `message`. */
export function gitCommit(cwd: string, message: string): Promise<GitCommitResult> {
  return apiPost<GitCommitResult>("/api/git/commit", { cwd, message });
}

/**
 * DESTRUCTIVE: discard uncommitted changes at `cwd`. With a `file`, discards
 * only that path; with none, discards every change in the working tree.
 */
export function gitDiscard(cwd: string, file?: string): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>("/api/git/discard", file !== undefined ? { cwd, file } : { cwd });
}

// ─────────────────────────────────────────────────────────────────────────────
// Approvals (M7) — the crown jewel: decide a pending permission gate.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decide a pending approval request from the dashboard. `allow` lets Claude
 * Code proceed; `deny` blocks it (with an optional reason surfaced to the
 * session). Resolves `{ ok: true }`; the matching `approval_resolved` WS frame
 * then drops the request from the live `pending` set.
 */
export function decideApproval(
  id: string,
  decision: ApprovalDecision,
  reason?: string,
): Promise<{ ok: true }> {
  const body = reason !== undefined ? { decision, reason } : { decision };
  return apiPost<{ ok: true }>(`/api/approvals/${encodeURIComponent(id)}/decision`, body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost — export the persisted daily spend ledger.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Download the persisted daily cost ledger as a CSV. Fetches with the token
 * header, then triggers a browser download via a temporary object URL. Throws
 * {@link ApiError} on a missing token or non-2xx so the caller can surface it.
 */
export async function exportCostCsv(): Promise<void> {
  const token = getToken();
  if (!token) {
    throw new ApiError("Missing access token", 401);
  }
  const res = await fetch("/api/cost/export.csv", {
    headers: { [TOKEN_HEADER]: token },
  });
  if (!res.ok) {
    throw new ApiError(`GET /api/cost/export.csv → ${res.status}`, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "foundrr-cost.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Access (away-surface) — reach the dashboard from your phone.
// ─────────────────────────────────────────────────────────────────────────────

/** Where an address can be reached from. */
export type AccessScope = "local" | "lan" | "tailscale";

/** A single reachable URL for the dashboard, with its scope + a ready token. */
export interface AccessAddress {
  /** Human label, e.g. "Local", "LAN (en0)", "Tailscale". */
  label: string;
  /** The host portion (ip or hostname), useful for display. */
  host: string;
  /** Full URL the phone can open — already includes `?token=`. */
  url: string;
  /** Where this address reaches from. */
  scope: AccessScope;
  /** Whether the daemon is actually bound so other devices can connect. */
  reachable: boolean;
}

/** Lifecycle of the optional public (cloudflared) tunnel. */
export type TunnelState = "off" | "starting" | "on" | "error";

/** State of the public tunnel control. */
export interface AccessTunnel {
  state: TunnelState;
  /** Public URL once `state === "on"`. */
  url?: string;
  /** Human error when `state === "error"`. */
  error?: string;
  /** Whether cloudflared is installed (gates the Start button). */
  installed: boolean;
  /** Suggested install command when not installed (e.g. `brew install cloudflared`). */
  installCmd?: string;
}

/** Shape of `GET /api/access` — everything the AccessPanel needs to render. */
export interface AccessInfo {
  port: number;
  boundHost: string;
  addresses: AccessAddress[];
  tunnel: AccessTunnel;
}

/**
 * Fetch reachable addresses + tunnel state for the away-surface panel.
 * Throws `ApiError` on a missing token, network failure, or non-2xx response;
 * the AccessPanel surfaces those rather than swallowing them.
 */
export function getAccess(): Promise<AccessInfo> {
  return apiGet<AccessInfo>("/api/access");
}

/**
 * Start the public tunnel. Resolves with the tunnel's new state — typically
 * `{ state: "starting" }`, or `{ state: "error", ... }` if it can't start.
 * Callers then poll {@link getAccess} until the state settles to `on`/`error`.
 */
export function startTunnel(): Promise<AccessTunnel> {
  return apiPost<AccessTunnel>("/api/access/tunnel");
}

/** Stop the public tunnel. Resolves with `{ state: "off" }`. */
export function stopTunnel(): Promise<AccessTunnel> {
  return apiDelete<AccessTunnel>("/api/access/tunnel");
}

// ─────────────────────────────────────────────────────────────────────────────
// Config — local daemon preferences backing the model picker.
// ─────────────────────────────────────────────────────────────────────────────

/** Shape of `GET /api/config`. */
export interface DaemonConfig {
  /** The chosen model/agent key (a stable key from the shared MODELS registry). */
  model: string;
  /** Whether anonymous global usage sharing is on. */
  telemetryShare: boolean;
}

/** Fetch the current daemon config (model + telemetry-share). */
export function getConfig(): Promise<DaemonConfig> {
  return apiGet<DaemonConfig>("/api/config");
}

/**
 * Set the active model/agent key. Throws `ApiError` (status 400) when the key
 * is not in the shared registry, or on a missing token / network / 5xx error;
 * callers revert their optimistic update and surface the failure.
 */
export async function setModelApi(model: string): Promise<void> {
  await apiPost<{ ok: true; model: string }>("/api/config/model", { model });
}

// ─────────────────────────────────────────────────────────────────────────────
// Agents — launchable terminal CLIs + per-command install detection.
// ─────────────────────────────────────────────────────────────────────────────

/** One launchable agent from `GET /api/agents`. */
export interface LaunchableAgent {
  /** Stable model key (e.g. "claude-code"). */
  key: string;
  /** Display name (e.g. "Claude Code"). */
  name: string;
  /** The terminal CLI command (e.g. "claude"). */
  command: string;
  /** Whether the command resolves on the daemon's PATH. */
  installed: boolean;
  /** Short install hint shown when not installed. */
  install?: string;
}

/**
 * Fetch the launchable agents and their install state. Defensive: any failure —
 * a missing route, network error, or malformed payload — resolves to `null` so
 * the picker simply skips the install hints rather than crashing.
 */
export async function getAgents(): Promise<LaunchableAgent[] | null> {
  try {
    const agents = await apiGet<unknown>("/api/agents");
    if (!Array.isArray(agents)) return null;
    return agents.filter(
      (a): a is LaunchableAgent =>
        a !== null &&
        typeof a === "object" &&
        typeof (a as LaunchableAgent).key === "string" &&
        typeof (a as LaunchableAgent).command === "string" &&
        typeof (a as LaunchableAgent).installed === "boolean",
    );
  } catch {
    // 404 / network / parse error → unknown. Never crash the dashboard.
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram (M6) — link status for the away-surface indicator.
// ─────────────────────────────────────────────────────────────────────────────

/** Shape of `GET /api/telegram/status`. */
export interface TelegramStatus {
  /** A chat is bound to the daemon (the phone can receive notifications). */
  linked: boolean;
  /** A bot token is configured on the daemon. */
  hasToken: boolean;
}

/** Result of `POST /api/telegram/link` — a single-use code to send the bot. */
export interface TelegramLinkResult {
  ok: boolean;
  /** "shared" → message @botUsername; "own" → message your own bot. */
  mode?: "shared" | "own";
  /** Which bot to message (shared mode only). */
  botUsername?: string;
  /** The single-use `/link <code>` code (shared mode only). */
  linkCode?: string;
  /** Human-readable error when ok=false. */
  error?: string;
}

/**
 * Turn the Telegram leash ON (shared mode, if it was off) and fetch a one-time
 * link code — the dashboard-side equivalent of `mc telegram link`. Throws an
 * {@link ApiError} on a non-2xx so the caller can surface the message.
 */
export function linkTelegram(): Promise<TelegramLinkResult> {
  return apiPost<TelegramLinkResult>("/api/telegram/link", {});
}

/**
 * Fetch the Telegram link status. Defensive by design: this endpoint may not
 * exist yet (404) and the daemon may add it later, so any failure — a missing
 * route, a network error, or a malformed payload — resolves to `null` rather
 * than throwing. Callers treat `null` as "status unknown" and render nothing.
 */
export async function getTelegramStatus(): Promise<TelegramStatus | null> {
  try {
    const status = await apiGet<unknown>("/api/telegram/status");
    if (
      status &&
      typeof status === "object" &&
      typeof (status as TelegramStatus).linked === "boolean" &&
      typeof (status as TelegramStatus).hasToken === "boolean"
    ) {
      return status as TelegramStatus;
    }
    return null;
  } catch {
    // 404 / network / parse error → status unknown. Never crash the dashboard.
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// License — Pro/Team entitlement (set/verify/clear the key).
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch the current entitlement (cached verdict + grace resolution). */
export function getLicense(): Promise<Entitlement> {
  return apiGet<Entitlement>("/api/license");
}

/**
 * Store a license key and verify it immediately. Resolves with the freshly
 * resolved entitlement. Throws `ApiError` (status 400) on an empty key, or on a
 * missing token / network / 5xx so the caller can surface the failure.
 */
export function saveLicense(key: string): Promise<Entitlement> {
  return apiPost<Entitlement>("/api/license", { key });
}

/** Remove the stored key; resolves with the (now free) entitlement. */
export function removeLicense(): Promise<Entitlement> {
  return apiDelete<Entitlement>("/api/license");
}

/**
 * Open a Stripe Customer Portal session for the stored license (cancel, switch
 * plan, update card, invoices). Resolves with the one-time portal URL; the
 * daemon proxies with the full key so it never reaches the browser. Throws
 * `ApiError` (502 when there's no key / the authority is down) so the caller
 * can surface it.
 */
export function openBillingPortal(): Promise<{ url: string }> {
  return apiPost<{ url: string }>("/api/license/portal");
}

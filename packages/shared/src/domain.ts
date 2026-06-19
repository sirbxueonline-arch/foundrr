/**
 * Domain state — the derived, client-facing shapes the dashboard renders.
 * These are produced by the daemon and never contain mock data.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Agents (M1)
// ─────────────────────────────────────────────────────────────────────────────

export type AgentStatus = "active" | "idle" | "waiting" | "error" | "ended";

export interface Achievement {
  ts: number; // epoch ms
  kind: "edit" | "command" | "subagent" | "prompt" | "notification" | "session";
  text: string;
}

export interface RecentEvent {
  ts: number;
  event: string;
  detail: string;
}

export interface CurrentActivity {
  kind: "tool" | "prompt" | "idle" | "waiting" | "error";
  /** Human-readable one-liner, e.g. "Editing src/foo.ts" or "Running: npm test". */
  label: string;
  tool?: string;
  target?: string;
  since: number; // epoch ms when this activity began
}

export interface AgentStats {
  filesEdited: number;
  tools: number;
  commands: number;
  subagents: number;
  prompts: number;
}

export interface AgentSession {
  sessionId: string;
  project: string; // basename(cwd)
  cwd: string;
  status: AgentStatus;
  current: CurrentActivity;
  stats: AgentStats;
  filesEditedList: string[]; // distinct file paths edited
  achievements: Achievement[]; // most-recent-first, capped
  recent: RecentEvent[]; // ring buffer, most-recent-first, capped
  startedAt: number;
  lastEventAt: number;
  lastPrompt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Servers (M2)
// ─────────────────────────────────────────────────────────────────────────────

export interface DetectedServer {
  port: number;
  pid: number;
  address: string; // bind address, e.g. 127.0.0.1 / 0.0.0.0 / ::
  framework: string; // best-guess, e.g. "Next.js", "Vite", "FastAPI", "Node"
  command: string; // full command line (may be truncated for display)
  cwd?: string;
  /** Matches a RegisteredServer by id when this detected process is a known one. */
  registeredId?: string;
  /**
   * When set, Mission Control is running a 0.0.0.0 reverse proxy to this
   * (often localhost-only) dev server on this port, so it can be previewed
   * remotely at http://<dashboard-host>:<exposedProxyPort>/.
   */
  exposedProxyPort?: number;
}

export interface RegisteredServer {
  id: string;
  name: string;
  cwd: string;
  command: string;
  createdAt: number;
  /** Last pid we launched for this registered server, if running. */
  pid?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Approvals (M7)
// ─────────────────────────────────────────────────────────────────────────────

export type ApprovalDecision = "allow" | "deny";
export type ApprovalState = "pending" | "allowed" | "denied" | "expired";

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  project: string;
  toolName: string;
  /** A short, human-readable summary of what's being requested. */
  summary: string;
  /** The Bash command or file path that triggered the gate. */
  detail: string;
  state: ApprovalState;
  createdAt: number;
  resolvedAt?: number;
  decidedBy?: "telegram" | "dashboard";
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost (M5)
// ─────────────────────────────────────────────────────────────────────────────

export interface CostSnapshot {
  /** Total USD across all sessions today (local day). */
  todayUsd: number;
  /** Total tokens today. */
  todayTokens: number;
  /** Per-session breakdown, keyed by session.id. */
  sessions: Record<string, { usd: number; tokens: number }>;
  updatedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Git (M4)
// ─────────────────────────────────────────────────────────────────────────────

export interface GitFileChange {
  path: string;
  /** Porcelain status code, e.g. "M", "A", "D", "??". */
  status: string;
  staged: boolean;
}

export interface GitStatus {
  cwd: string;
  branch: string;
  ahead: number;
  behind: number;
  clean: boolean;
  files: GitFileChange[];
}

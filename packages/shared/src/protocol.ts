/**
 * Wire protocol — WebSocket stream messages and terminal control frames.
 * Shared verbatim between daemon and dashboard.
 */
import type {
  AgentSession,
  ApprovalRequest,
  CostSnapshot,
  DetectedServer,
} from "./domain.js";

// ─── WS /stream : daemon → dashboard ─────────────────────────────────────────

export interface SnapshotMessage {
  type: "snapshot";
  sessions: AgentSession[];
  servers: DetectedServer[];
  approvals: ApprovalRequest[];
  cost: CostSnapshot | null;
  serverTime: number;
}

export interface SessionUpdateMessage {
  type: "session";
  session: AgentSession;
}

export interface SessionRemovedMessage {
  type: "session_removed";
  sessionId: string;
}

export interface ServersMessage {
  type: "servers";
  servers: DetectedServer[];
}

export interface ApprovalMessage {
  type: "approval";
  approval: ApprovalRequest;
}

export interface ApprovalResolvedMessage {
  type: "approval_resolved";
  approval: ApprovalRequest;
}

export interface CostMessage {
  type: "cost";
  cost: CostSnapshot;
}

export type StreamMessage =
  | SnapshotMessage
  | SessionUpdateMessage
  | SessionRemovedMessage
  | ServersMessage
  | ApprovalMessage
  | ApprovalResolvedMessage
  | CostMessage;

// ─── WS /term : terminal multiplexing (M3) ───────────────────────────────────

/**
 * Terminal framing: the first byte tags the frame.
 *   0x00 + JSON  → control frame (resize, etc.)
 *   anything else → raw PTY bytes (client→server keystrokes, server→client output)
 */
export const TERM_CONTROL_PREFIX = 0x00;

/**
 * Floor for a valid terminal geometry, shared by both ends of the wire.
 *
 * A real terminal is never 1×1. A sub-minimum size is the symptom of a hidden
 * or unlaid-out client container: when clientWidth is 0 (e.g. an inactive tab
 * hidden with display:none), xterm's FitAddon clamps cols to 1. The web client
 * must not SEND such a resize and the daemon must IGNORE one if it does — that
 * combination is what made a full-screen TUI render one character per line.
 */
export const TERM_MIN_COLS = 2;
export const TERM_MIN_ROWS = 2;

export interface TermResizeFrame {
  t: "resize";
  cols: number;
  rows: number;
}

export type TermControlFrame = TermResizeFrame;

export interface TerminalTabInfo {
  id: string;
  title: string;
  cwd: string;
  shell: string; // "claude" | the resolved shell path
  createdAt: number;
}

// ─── REST DTOs ───────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
}

export interface RegisterServerBody {
  name: string;
  cwd: string;
  command: string;
}

export interface QuickReplyBody {
  sessionId: string;
  text: string;
}

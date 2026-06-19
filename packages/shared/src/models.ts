/**
 * Model registry — the canonical top-10 AI coding agents. Shared between the
 * daemon (telemetry reporter + `mc config model`) and the landing page
 * leaderboard so both ends agree on keys, display names, and brand accents.
 *
 * The `key` is the 'agent' value stored in the cloud DB; it is load-bearing and
 * must never change once published. `accent` is a brand color used by the web
 * leaderboard (kept here so the registry is the single source of truth).
 */

export interface ModelInfo {
  /** Stable identifier; the 'agent' value persisted in the DB. Never rename. */
  readonly key: string;
  /** Human-readable display name. */
  readonly name: string;
  /** Vendor / steward of the agent. */
  readonly vendor: string;
  /** Brand accent color (hex), used by the web leaderboard. */
  readonly accent: string;
}

/** Canonical top-10 AI coding agents. Order is the default leaderboard order. */
export const MODELS: readonly ModelInfo[] = Object.freeze([
  { key: "claude-code", name: "Claude Code", vendor: "Anthropic", accent: "#f2a23c" },
  { key: "openai-codex", name: "OpenAI Codex", vendor: "OpenAI", accent: "#10a37f" },
  { key: "gemini-cli", name: "Gemini CLI", vendor: "Google", accent: "#4285f4" },
  { key: "cursor", name: "Cursor", vendor: "Anysphere", accent: "#e6eaf0" },
  {
    key: "github-copilot",
    name: "GitHub Copilot",
    vendor: "GitHub / Microsoft",
    accent: "#8b5cf6",
  },
  { key: "aider", name: "Aider", vendor: "open source", accent: "#74c69d" },
  { key: "cline", name: "Cline", vendor: "open source", accent: "#56b6c2" },
  { key: "windsurf", name: "Windsurf", vendor: "Codeium", accent: "#06b6d4" },
  { key: "continue", name: "Continue", vendor: "open source", accent: "#f59e0b" },
  {
    key: "amazon-q",
    name: "Amazon Q Developer",
    vendor: "AWS",
    accent: "#ff9900",
  },
]);

/** The default model key when a user has not picked one. */
export const DEFAULT_MODEL = "claude-code";

/** Look up a model by its stable key; undefined if no match. */
export function modelByKey(key: string): ModelInfo | undefined {
  return MODELS.find((m) => m.key === key);
}

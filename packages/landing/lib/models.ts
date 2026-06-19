// Self-contained model registry for the landing page.
// Do NOT import @mission-control/shared here — this package deploys to Vercel
// independently of the daemon/dashboard workspace.

export interface Model {
  readonly key: string;
  readonly name: string;
  readonly vendor: string;
  readonly color: string;
}

// Canonical top-10 AI coding agents. The `key` values are the exact `agent`
// strings stored in the Supabase `model_leaderboard` table.
export const MODELS: readonly Model[] = [
  { key: "claude-code", name: "Claude Code", vendor: "Anthropic", color: "#f2a23c" },
  { key: "openai-codex", name: "OpenAI Codex", vendor: "OpenAI", color: "#10a37f" },
  { key: "gemini-cli", name: "Gemini CLI", vendor: "Google", color: "#4285f4" },
  { key: "cursor", name: "Cursor", vendor: "Anysphere", color: "#e6eaf0" },
  { key: "github-copilot", name: "GitHub Copilot", vendor: "GitHub / Microsoft", color: "#8b5cf6" },
  { key: "aider", name: "Aider", vendor: "open source", color: "#74c69d" },
  { key: "cline", name: "Cline", vendor: "open source", color: "#56b6c2" },
  { key: "windsurf", name: "Windsurf", vendor: "Codeium", color: "#06b6d4" },
  { key: "continue", name: "Continue", vendor: "open source", color: "#f59e0b" },
  { key: "amazon-q", name: "Amazon Q Developer", vendor: "AWS", color: "#ff9900" },
] as const;

export const modelByKey: ReadonlyMap<string, Model> = new Map(
  MODELS.map((model) => [model.key, model]),
);

const DEFAULT_UNKNOWN_COLOR = "#8a95a3";

function titleCaseKey(key: string): string {
  return key
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// Resolve any agent key to a display model, falling back to a title-cased
// label for keys not in the canonical list.
export function resolveModel(key: string): Model {
  const known = modelByKey.get(key);
  if (known) return known;
  return {
    key,
    name: titleCaseKey(key) || "Unknown Agent",
    vendor: "unknown",
    color: DEFAULT_UNKNOWN_COLOR,
  };
}

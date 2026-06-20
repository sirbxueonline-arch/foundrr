"use client";

import { useId, useRef, useState } from "react";

import { CodeBlock } from "@/components/CodeBlock";
import { logoForKey } from "@/components/BrandLogos";

/** A single terminal coding agent shown in the tabbed installer. */
interface Agent {
  readonly id: string;
  readonly name: string;
  readonly vendor: string;
  /** Accent color used for the logo tile + active tab tint. */
  readonly color: string;
  /** One-line summary shown in the panel header. */
  readonly blurb: string;
  /** Short capability tags surfaced as chips in the panel. */
  readonly tags: readonly string[];
  /** One-line install command, or null for agents installed per-platform. */
  readonly command: string | null;
  readonly link: { readonly href: string; readonly label: string };
  /** Short note shown under the command (e.g. for Amazon Q's per-OS install). */
  readonly note?: string;
}

const CLAUDE_CODE_URL = "https://claude.com/claude-code";
const CODEX_URL = "https://github.com/openai/codex";
const GEMINI_CLI_URL = "https://github.com/google-gemini/gemini-cli";
const AIDER_URL = "https://aider.chat";
const AMAZON_Q_DOCS_URL =
  "https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line-installing.html";

/** Tab order. Claude Code is first and the default selection. */
const AGENTS: readonly Agent[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    vendor: "Anthropic",
    color: "#f2a23c",
    blurb: "First-class support. Precise token + cost metering and hook install.",
    tags: ["Recommended", "Precise metering", "Hooks auto-install"],
    command: "npm install -g @anthropic-ai/claude-code",
    link: { href: CLAUDE_CODE_URL, label: "claude.com/claude-code" },
  },
  {
    id: "openai-codex",
    name: "OpenAI Codex",
    vendor: "OpenAI",
    color: "#10a37f",
    blurb: "The Codex CLI agent. Sessions and token spend tracked best-effort.",
    tags: ["npm global", "Best-effort metering"],
    command: "npm install -g @openai/codex",
    link: { href: CODEX_URL, label: "github.com/openai/codex" },
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    vendor: "Google",
    color: "#4285f4",
    blurb: "Google's open-source terminal agent. Runs alongside Founder.",
    tags: ["npm global", "Best-effort metering"],
    command: "npm install -g @google/gemini-cli",
    link: { href: GEMINI_CLI_URL, label: "github.com/google-gemini/gemini-cli" },
  },
  {
    id: "aider",
    name: "Aider",
    vendor: "open source",
    color: "#74c69d",
    blurb: "Pair-programming in your terminal. Installs cleanly via pipx.",
    tags: ["pipx", "Best-effort metering"],
    command: "pipx install aider-chat",
    link: { href: AIDER_URL, label: "aider.chat" },
  },
  {
    id: "amazon-q",
    name: "Amazon Q",
    vendor: "AWS",
    color: "#ff9900",
    blurb: "The Amazon Q Developer CLI. Installs per-platform from AWS.",
    tags: ["Per-platform", "AWS guide"],
    command: null,
    link: {
      href: AMAZON_Q_DOCS_URL,
      label: "AWS Amazon Q Developer CLI docs",
    },
    note: "The Amazon Q Developer CLI installs per-platform. Follow AWS's official guide for your OS.",
  },
] as const;

function ExternalIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="inline-block"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6M10 14 21 3" />
    </svg>
  );
}

/** A brand-tinted square tile holding an agent's inline logo mark. */
function LogoTile({
  agentId,
  color,
  size = 18,
  tile = 34,
}: {
  agentId: string;
  color: string;
  size?: number;
  tile?: number;
}) {
  const Logo = logoForKey(agentId);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg border"
      style={{
        width: tile,
        height: tile,
        color,
        borderColor: `color-mix(in srgb, ${color} 28%, var(--line))`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
      aria-hidden
    >
      <Logo size={size} />
    </span>
  );
}

/**
 * Accessible tabbed agent picker with brand logos. A `tablist` of terminal
 * agents sits in a left rail (top row on mobile) beside a single `tabpanel`
 * showing the selected agent's logo, blurb, capability chips, and install line.
 *
 * Keyboard: Up/Down + Left/Right (and Home/End) move between tabs using roving
 * tabindex, matching the WAI-ARIA tabs pattern. Selection follows focus.
 */
export function AgentInstaller() {
  const [activeId, setActiveId] = useState<string>(AGENTS[0]!.id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();

  const activeIndex = AGENTS.findIndex((a) => a.id === activeId);
  const active = AGENTS[activeIndex] ?? AGENTS[0]!;

  const focusTab = (index: number) => {
    const next = ((index % AGENTS.length) + AGENTS.length) % AGENTS.length;
    const agent = AGENTS[next];
    if (!agent) return;
    setActiveId(agent.id);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusTab(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusTab(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTab(0);
        break;
      case "End":
        event.preventDefault();
        focusTab(AGENTS.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-[color-mix(in_srgb,var(--panel)_55%,transparent)]">
      <div className="grid lg:grid-cols-[15rem_1fr]">
        {/* ── Tablist: left rail on desktop, horizontal scroll on mobile ───── */}
        <div className="border-b border-line p-2 lg:border-b-0 lg:border-r lg:p-2.5">
          <p className="hidden px-2.5 pb-2 pt-1.5 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-faint lg:block">
            Choose your agent
          </p>
          <div
            role="tablist"
            aria-label="Choose your AI coding agent"
            aria-orientation="vertical"
            className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {AGENTS.map((agent, i) => {
              const selected = agent.id === activeId;
              return (
                <button
                  key={agent.id}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  role="tab"
                  id={`${baseId}-tab-${agent.id}`}
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel-${agent.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveId(agent.id)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className={`group relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-left font-display text-sm font-medium transition-colors lg:w-full ${
                    selected
                      ? "bg-[color-mix(in_srgb,var(--signal)_13%,var(--panel))] text-text shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--signal)_34%,transparent)]"
                      : "text-muted hover:bg-[color-mix(in_srgb,var(--panel)_75%,transparent)] hover:text-text"
                  }`}
                >
                  <LogoTile agentId={agent.id} color={agent.color} tile={28} size={16} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate leading-tight">{agent.name}</span>
                    <span className="hidden truncate text-[0.7rem] font-normal text-faint lg:block">
                      {agent.vendor}
                    </span>
                  </span>
                  {selected ? (
                    <span
                      className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-signal lg:block"
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Panel: only the active agent ─────────────────────────────────── */}
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.id}`}
          aria-labelledby={`${baseId}-tab-${active.id}`}
          tabIndex={0}
          className="bg-[color-mix(in_srgb,var(--void-2)_45%,transparent)] p-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cool sm:p-7"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <LogoTile agentId={active.id} color={active.color} tile={44} size={24} />
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight text-text">
                  {active.name}
                </h3>
                <p className="mt-0.5 font-mono text-xs text-faint">
                  {active.vendor}
                </p>
              </div>
            </div>
            <a
              href={active.link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-[color-mix(in_srgb,var(--panel)_60%,transparent)] px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-[var(--cool)] hover:text-cool"
            >
              Docs
              <ExternalIcon />
            </a>
          </div>

          <p className="mt-4 max-w-xl text-sm text-muted leading-relaxed">
            {active.blurb}
          </p>

          {/* Capability chips */}
          <ul className="mt-4 flex flex-wrap gap-2">
            {active.tags.map((tag, i) => {
              const primary = i === 0;
              return (
                <li
                  key={tag}
                  className={`rounded-full border px-2.5 py-1 font-mono text-[0.68rem] tracking-wide ${
                    primary
                      ? "border-[color-mix(in_srgb,var(--signal)_40%,var(--line))] bg-[color-mix(in_srgb,var(--signal)_12%,transparent)] text-signal"
                      : "border-line bg-[color-mix(in_srgb,var(--panel)_55%,transparent)] text-muted"
                  }`}
                >
                  {tag}
                </li>
              );
            })}
          </ul>

          <div className="mt-5 border-t border-line/70 pt-5">
            <p className="mb-2.5 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-faint">
              {active.command ? "Install" : "How to install"}
            </p>
            {active.command ? (
              <CodeBlock code={active.command} prompt="$" />
            ) : (
              <>
                {active.note ? (
                  <p className="text-sm text-muted leading-relaxed">
                    {active.note}
                  </p>
                ) : null}
                <a
                  href={active.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg border border-line bg-[color-mix(in_srgb,var(--void-2)_88%,transparent)] px-4 py-2.5 text-sm font-medium text-text transition-colors hover:border-[var(--cool)] hover:text-cool"
                >
                  {active.link.label}
                  <ExternalIcon />
                </a>
              </>
            )}
          </div>

          {/* Quiet IDE note — not a tab. */}
          <p className="mt-5 text-xs text-faint leading-relaxed">
            Cursor, GitHub Copilot, Cline, Windsurf, and Continue are IDE-based —
            they run inside your editor, so there&apos;s no terminal agent to
            install.
          </p>
        </div>
      </div>
    </div>
  );
}

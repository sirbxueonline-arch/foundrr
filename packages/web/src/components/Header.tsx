/**
 * Header — the Foundrr wordmark, a connection indicator, a live count
 * of active agents, and a faint sweeping activity line that only animates when
 * at least one agent is active (the page is otherwise calm and cool).
 */
import type { ReactNode } from "react";
import type { CostSnapshot } from "@mission-control/shared";
import type { LaunchableAgent } from "../lib/api";
import type { StreamStatus } from "../lib/useStream";
import { CostMeter } from "./CostMeter";
import { ModelPicker } from "./ModelPicker";

interface HeaderProps {
  status: StreamStatus;
  /** Number of sessions currently active or waiting. */
  activeCount: number;
  /** Live cost/token telemetry; null until the first snapshot (or if off). */
  cost: CostSnapshot | null;
  /** Optional subtle away-surface indicator (e.g. Telegram link status). */
  telegram?: ReactNode;
  /** Open the "Access from anywhere" panel (the away-surface enabler). */
  onOpenAccess: () => void;
  /** The selected model key (lifted to App); null until loaded. */
  model: string | null;
  /** Launchable agents + install state for the picker hints; null if unknown. */
  agents: LaunchableAgent[] | null;
  /** Called when the user picks a different model. */
  onModelChange: (model: string) => void;
}

interface ConnStyle {
  label: string;
  /** Status-dot fill (bright accent OK as a fill). */
  dot: string;
  /** Status text (AA on white — amber uses the deeper amber-ink). */
  text: string;
}

const CONN: Record<StreamStatus, ConnStyle> = {
  open: { label: "CONNECTED", dot: "var(--color-ok)", text: "var(--color-ok)" },
  connecting: { label: "CONNECTING", dot: "var(--color-cool)", text: "var(--color-cool)" },
  reconnecting: {
    label: "RECONNECTING",
    dot: "var(--color-signal)",
    text: "var(--color-signal-ink)",
  },
};

export function Header({
  status,
  activeCount,
  cost,
  telegram,
  onOpenAccess,
  model,
  agents,
  onModelChange,
}: HeaderProps) {
  const conn = CONN[status];
  const anyActive = activeCount > 0;
  // The dev box this dashboard supervises — shown in faint mono beside the
  // wordmark, like the landing nav. SSR-safe guard for the rare null host.
  const host = typeof window !== "undefined" ? window.location.hostname : "";

  return (
    // Hairline bottom only — Aqua separates with hairlines, not boxed chrome.
    // The header sits directly on --void so it reads as one calm telemetry strip.
    <header className="relative border-b hairline" style={{ backgroundColor: "var(--color-void)" }}>
      {/* The single permitted flourish: one faint amber sweep under the header,
          animating only when something is active. Clipped to the header width so
          it can never push horizontal overflow. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden" aria-hidden="true">
        {anyActive ? (
          <div
            className="sweep-line h-px w-1/3"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--color-signal), transparent)",
            }}
          />
        ) : null}
      </div>

      {/* Below lg this STACKS into two rows (brand row, controls row) so the
          control cluster can never overlap the wordmark on phones/tablets — the
          old single-row `sm:` layout collapsed the flex-1 brand to 0 and the
          shrink-0 cluster bled over it. At lg it's one row again. */}
      <div className="flex flex-col gap-2 px-3 py-2.5 lg:flex-row lg:items-center lg:gap-4 lg:px-4 lg:py-3">
        {/* Wordmark + hostname + active count. Allowed to shrink/truncate so the
            right-side controls (cost, dot) are never clipped off. */}
        <div className="flex min-w-0 items-baseline gap-2 lg:flex-1 lg:gap-3">
          <span
            className="flex shrink-0 items-baseline gap-1.5 text-sm font-light tracking-tight sm:text-base"
            style={{ color: "var(--color-text)" }}
          >
            {/* ◆ diamond wordmark — the same family mark as the landing nav.
                Deeper amber-ink so the small glyph stays AA on white. */}
            <span aria-hidden="true" style={{ color: "var(--color-signal-ink)" }}>
              ◆
            </span>
            <span>Foundrr</span>
          </span>
          {host ? (
            <span className="mono hidden truncate text-xs lg:inline" style={{ color: "var(--color-faint)" }}>
              {host}
            </span>
          ) : null}
          {/* Only the live-agents metric is tinted amber; idle reads neutral.
              Amber-ink keeps the count AA on white. */}
          <span
            className="mono shrink-0 text-xs tabular-nums"
            style={{ color: anyActive ? "var(--color-signal-ink)" : "var(--color-faint)" }}
          >
            {anyActive ? `${activeCount} active` : "idle"}
          </span>
        </div>

        <div className="flex items-center gap-2 lg:shrink-0 lg:gap-4">
          {/* Pick your AI — tags telemetry + the global leaderboard bucket, and
              drives which agent the terminal launches. */}
          <ModelPicker model={model} agents={agents} onModelChange={onModelChange} />

          {/* Away-surface enabler — visible on desktop AND mobile. Cool ghost
              pill: interactive affordance, neutral until hover lifts it. */}
          <button
            type="button"
            onClick={onOpenAccess}
            aria-label="Access from anywhere"
            className="pill pill-cool shrink-0"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            <span>CONNECT</span>
          </button>

          {/* Secondary status text — only in the full desktop strip. */}
          <span className="hidden lg:inline-flex">{telegram}</span>

          {/* Hairline divider — groups the spend/connection telemetry apart from
              the model + access controls so the strip reads in two calm halves. */}
          <span
            className="hidden h-4 w-px shrink-0 lg:block"
            style={{ backgroundColor: "var(--color-line)" }}
            aria-hidden="true"
          />

          <CostMeter cost={cost} />

          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: conn.dot }}
            aria-hidden="true"
          />
          {/* CONNECTED/CONNECTING label is secondary — the dot carries it on mobile. */}
          <span
            className="mono hidden text-[0.625rem] tracking-wider lg:inline"
            style={{ color: conn.text }}
            role="status"
            aria-live="polite"
          >
            {conn.label}
          </span>
        </div>
      </div>
    </header>
  );
}

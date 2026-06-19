/**
 * Header — the FOUNDER wordmark, a connection indicator, a live count
 * of active agents, and a faint sweeping activity line that only animates when
 * at least one agent is active (the page is otherwise calm and cool).
 */
import type { ReactNode } from "react";
import type { CostSnapshot } from "@mission-control/shared";
import type { StreamStatus } from "../lib/useStream";
import { CostMeter } from "./CostMeter";

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
}

interface ConnStyle {
  label: string;
  color: string;
}

const CONN: Record<StreamStatus, ConnStyle> = {
  open: { label: "CONNECTED", color: "var(--color-ok)" },
  connecting: { label: "CONNECTING", color: "var(--color-cool)" },
  reconnecting: { label: "RECONNECTING", color: "var(--color-signal)" },
};

export function Header({ status, activeCount, cost, telegram, onOpenAccess }: HeaderProps) {
  const conn = CONN[status];
  const anyActive = activeCount > 0;

  return (
    <header className="relative border-b hairline" style={{ backgroundColor: "var(--color-panel)" }}>
      {/* Sweeping activity line — animates only when something is active. Clipped
          to the header width so it can never push horizontal overflow. */}
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

      <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3">
        {/* Wordmark + active count. Allowed to shrink/truncate so the right-side
            controls (cost, dot) are never clipped off the edge on mobile. */}
        <div className="flex min-w-0 flex-1 items-baseline gap-2 sm:gap-3">
          <span
            className="truncate text-sm font-bold tracking-[0.14em] sm:whitespace-nowrap sm:text-base sm:tracking-[0.18em]"
            style={{ color: "var(--color-text)" }}
          >
            FOUNDER
          </span>
          <span className="mono shrink-0 text-xs" style={{ color: "var(--color-faint)" }}>
            {anyActive ? `${activeCount} active` : "idle"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {/* Away-surface enabler — visible on desktop AND mobile. */}
          <button
            type="button"
            onClick={onOpenAccess}
            aria-label="Access from anywhere"
            className="mono inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[0.625rem] tracking-wider transition-colors"
            style={{
              color: "var(--color-cool)",
              border: "1px solid var(--color-cool)",
              backgroundColor: "color-mix(in srgb, var(--color-cool) 10%, transparent)",
            }}
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

          {/* Secondary status text — hidden on mobile to keep the row tidy. */}
          <span className="hidden sm:inline-flex">{telegram}</span>

          <CostMeter cost={cost} />

          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: conn.color }}
            aria-hidden="true"
          />
          {/* CONNECTED/CONNECTING label is secondary — the dot carries it on mobile. */}
          <span
            className="mono hidden text-[0.625rem] tracking-wider sm:inline"
            style={{ color: conn.color }}
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

/**
 * Sidebar — the desktop navigation rail. It owns the page switcher AND the
 * controls that used to crowd the header (model picker, Connect, cost meter,
 * connection status), so the main area is a single, un-crammed full-width page.
 *
 * Shared with the mobile layout: the `Page` type and the `NAV` list (label +
 * icon) are exported so the mobile bottom bar renders the exact same pages.
 * On mobile the rail is hidden (`hidden lg:flex`); App renders the bottom bar
 * + a slim top header instead.
 */
import type { ReactNode } from "react";
import type { CostSnapshot } from "@mission-control/shared";
import type { LaunchableAgent } from "../lib/api";
import type { StreamStatus } from "../lib/useStream";
import { CostMeter } from "./CostMeter";
import { ModelPicker } from "./ModelPicker";
import { ThemeToggle } from "./ThemeToggle";

export type Page = "agents" | "changes" | "servers" | "terminal" | "stats";

interface NavItem {
  id: Page;
  label: string;
  icon: ReactNode;
}

const ICON = {
  agents: <path d="M3 12h4l2.5 7 5-14 2.5 7h4" />,
  changes: (
    <>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <path d="M6 8.2v7.6" />
      <path d="M18 6.2v5.8a4 4 0 0 1-4 4h-3.5" />
      <circle cx="18" cy="6" r="2.2" />
    </>
  ),
  servers: (
    <>
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path d="M7 7h.01M7 17h.01" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 9l3 3-3 3" />
      <path d="M13 15h4" />
    </>
  ),
  stats: <path d="M4 20V11M10 20V5M16 20v-7M21 20H3" />,
} as const;

/** The page list, shared between the desktop rail and the mobile bottom bar. */
export const NAV: readonly NavItem[] = [
  { id: "agents", label: "Agents", icon: ICON.agents },
  { id: "changes", label: "Changes", icon: ICON.changes },
  { id: "servers", label: "Servers", icon: ICON.servers },
  { id: "terminal", label: "Terminal", icon: ICON.terminal },
  { id: "stats", label: "Stats", icon: ICON.stats },
];

const CONN: Record<StreamStatus, { label: string; dot: string; text: string }> = {
  open: { label: "Connected", dot: "var(--color-ok)", text: "var(--color-ok)" },
  connecting: { label: "Connecting", dot: "var(--color-cool)", text: "var(--color-cool)" },
  reconnecting: { label: "Reconnecting", dot: "var(--color-signal)", text: "var(--color-signal-ink)" },
};

/** A 16px stroked glyph wrapper so every nav icon shares one visual weight. */
function NavGlyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

interface SidebarProps {
  page: Page;
  onNavigate: (page: Page) => void;
  activeCount: number;
  status: StreamStatus;
  cost: CostSnapshot | null;
  model: string | null;
  agents: LaunchableAgent[] | null;
  onModelChange: (model: string) => void;
  onOpenAccess: () => void;
  telegram?: ReactNode;
  /** The dev box this dashboard supervises (shown faint under the wordmark). */
  host: string;
}

export function Sidebar({
  page,
  onNavigate,
  activeCount,
  status,
  cost,
  model,
  agents,
  onModelChange,
  onOpenAccess,
  telegram,
  host,
}: SidebarProps) {
  const conn = CONN[status];

  return (
    <aside
      className="hidden w-56 shrink-0 flex-col border-r lg:flex hairline"
      style={{ backgroundColor: "var(--color-void)" }}
      aria-label="Sidebar"
    >
      {/* Wordmark + host */}
      <div className="flex flex-col gap-0.5 px-4 py-4">
        <span
          className="flex items-baseline gap-1.5 text-base font-light tracking-tight"
          style={{ color: "var(--color-text)" }}
        >
          <span aria-hidden="true" style={{ color: "var(--color-signal-ink)" }}>
            ◆
          </span>
          <span>Foundrr</span>
        </span>
        {host ? (
          <span className="mono truncate text-[0.625rem]" style={{ color: "var(--color-faint)" }}>
            {host}
          </span>
        ) : null}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 px-2" aria-label="Pages">
        {NAV.map((item) => {
          const selected = page === item.id;
          const showCount = item.id === "agents" && activeCount > 0;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={selected ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors"
              style={{
                color: selected ? "var(--color-text)" : "var(--color-muted)",
                backgroundColor: selected ? "var(--color-inset)" : "transparent",
                fontWeight: selected ? 500 : 400,
              }}
            >
              <span style={{ color: selected ? "var(--color-signal-ink)" : "var(--color-faint)" }}>
                <NavGlyph>{item.icon}</NavGlyph>
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              {showCount ? (
                <span
                  className="mono inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[0.625rem] tabular-nums"
                  style={{
                    color: "var(--color-signal-ink)",
                    backgroundColor: "color-mix(in srgb, var(--color-signal) 18%, transparent)",
                  }}
                >
                  {activeCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Footer controls — the de-crammed header lives here on desktop. */}
      <div className="flex flex-col gap-3 border-t p-3 hairline">
        <ModelPicker model={model} agents={agents} onModelChange={onModelChange} />

        <button
          type="button"
          onClick={onOpenAccess}
          aria-label="Access from anywhere"
          className="pill pill-cool w-full"
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
          <span>Connect</span>
        </button>

        <ThemeToggle className="w-full" />

        {telegram ? <div className="px-0.5">{telegram}</div> : null}

        {/* Stacked, not side-by-side: the full cost readout + connection status
            are too wide to share one line in the narrow rail. */}
        <div className="flex flex-col gap-2 px-0.5">
          <CostMeter cost={cost} />
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: conn.dot }}
              aria-hidden="true"
            />
            <span
              className="mono text-[0.625rem] tracking-wide"
              style={{ color: conn.text }}
              role="status"
              aria-live="polite"
            >
              {conn.label}
            </span>
          </span>
        </div>
      </div>
    </aside>
  );
}

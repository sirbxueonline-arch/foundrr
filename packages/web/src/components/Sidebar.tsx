/**
 * Sidebar — the desktop navigation rail, built to match Cursor's dashboard
 * (pulled from Mobbin): a neutral letter-avatar identity block with a small
 * connection dot, a monochrome nav grouped by whitespace with a subtle filled
 * "selected" state, and nothing pinned at the foot. All preferences live on the
 * Settings page, so the rail is pure navigation — Cursor's frame.
 *
 * Shared with mobile: the `Page` type and `NAV` list are exported so the mobile
 * bottom bar renders the same pages.
 */
import type { ReactNode } from "react";
import type { StreamStatus } from "../lib/useStream";

export type Page = "agents" | "changes" | "servers" | "terminal" | "stats" | "settings";

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
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
} as const;

/** The page list, shared between the desktop rail and the mobile bottom bar. */
export const NAV: readonly NavItem[] = [
  { id: "agents", label: "Agents", icon: ICON.agents },
  { id: "changes", label: "Changes", icon: ICON.changes },
  { id: "servers", label: "Servers", icon: ICON.servers },
  { id: "terminal", label: "Terminal", icon: ICON.terminal },
  { id: "stats", label: "Overview", icon: ICON.stats },
  { id: "settings", label: "Settings", icon: ICON.settings },
];

const CONN: Record<StreamStatus, { label: string; dot: string }> = {
  open: { label: "Connected", dot: "var(--color-ok)" },
  connecting: { label: "Connecting", dot: "var(--color-cool)" },
  reconnecting: { label: "Reconnecting", dot: "var(--color-signal)" },
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
  /** The dev box this dashboard supervises (avatar initial + identity subline). */
  host: string;
}

export function Sidebar({ page, onNavigate, activeCount, status, host }: SidebarProps) {
  const conn = CONN[status];
  const initial = host?.trim().charAt(0).toUpperCase() || "F";

  return (
    <aside
      className="hidden w-56 shrink-0 flex-col border-r lg:flex hairline"
      style={{ backgroundColor: "var(--color-void)" }}
      aria-label="Sidebar"
    >
      {/* Identity — Cursor's letter avatar + name + subline (with a presence dot). */}
      <div className="flex items-center gap-2.5 px-3 py-3.5">
        <span
          className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-medium"
          style={{
            backgroundColor: "var(--color-inset)",
            color: "var(--color-muted)",
            border: "1px solid var(--color-line)",
          }}
        >
          {initial}
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: conn.dot, border: "2px solid var(--color-void)" }}
            title={conn.label}
            aria-label={conn.label}
            role="status"
          />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" style={{ color: "var(--color-text)" }}>
            Foundrr
          </p>
          <p className="truncate text-[0.6875rem]" style={{ color: "var(--color-faint)" }}>
            {host ? `Local · ${host}` : "Local"}
          </p>
        </div>
      </div>

      {/* Nav — monochrome, grouped by whitespace; selected = subtle inset fill. */}
      <nav className="flex flex-1 flex-col px-2 pb-3" aria-label="Pages">
        {NAV.map((item) => {
          const selected = page === item.id;
          const showCount = item.id === "agents" && activeCount > 0;
          // Cursor separates nav groups with whitespace: the Overview + Settings
          // pages sit a little apart from the live-work pages above.
          const groupStart = item.id === "stats" || item.id === "settings";
          return (
            <button
              key={item.id}
              type="button"
              aria-current={selected ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
              className={`nav-item flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm ${groupStart ? "mt-3" : "mt-0.5"}`}
              style={{
                color: selected ? "var(--color-text)" : "var(--color-muted)",
                fontWeight: selected ? 500 : 400,
                ...(selected ? { backgroundColor: "var(--color-inset)" } : {}),
              }}
            >
              <span style={{ color: selected ? "var(--color-text)" : "var(--color-faint)" }}>
                <NavGlyph>{item.icon}</NavGlyph>
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              {showCount ? (
                <span
                  className="mono text-[0.625rem] tabular-nums"
                  style={{ color: "var(--color-faint)" }}
                >
                  {activeCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

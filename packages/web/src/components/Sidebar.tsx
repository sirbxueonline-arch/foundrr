/**
 * Sidebar — the desktop navigation rail, built to match Cursor's dashboard: a
 * neutral letter-avatar identity block with a small connection dot, a monochrome
 * nav with a subtle filled "selected" state, an even vertical rhythm on every
 * row, and Settings pinned to the very bottom of the rail. The live-work pages
 * (Agents/Changes/Servers/Terminal) and Overview flow as one group; a single
 * hairline divider sets the pinned Settings apart — one separator, not scattered
 * gaps. That's Cursor's frame: pure navigation, preferences live on the Settings
 * page. The identity block also carries a small plan badge once a paid license
 * is active, so the plan is visible app-wide — not only on the Settings page.
 *
 * Shared with mobile: the `Page` type and `NAV` list are exported so the mobile
 * bottom bar renders the same pages, in the same order.
 */
import type { ReactNode } from "react";
import type { LicensePlan } from "@mission-control/shared";
import type { StreamStatus } from "../lib/useStream";
import { useEntitlement, isPaid } from "../lib/useEntitlement";

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

/**
 * The page list, shared between the desktop rail and the mobile bottom bar. This
 * is the single source of truth for page order, labels, and icons — the mobile
 * bar (App.tsx) maps it directly, so it must never be mutated or reordered here.
 */
export const NAV: readonly NavItem[] = [
  { id: "agents", label: "Agents", icon: ICON.agents },
  { id: "changes", label: "Changes", icon: ICON.changes },
  { id: "servers", label: "Servers", icon: ICON.servers },
  { id: "terminal", label: "Terminal", icon: ICON.terminal },
  { id: "stats", label: "Overview", icon: ICON.stats },
  { id: "settings", label: "Settings", icon: ICON.settings },
];

/**
 * Pages pinned to the foot of the rail (Cursor's "preferences at the bottom"
 * frame). A typed Set keeps the partition data-driven and reorder-resilient: the
 * rail derives both stacks from NAV by membership, so adding another pinned page
 * later is a one-line change here with no JSX edit. Overview is deliberately NOT
 * in here — it's a dashboard view, not preferences, so it stays in the main flow.
 */
const FOOTER_PAGES: ReadonlySet<Page> = new Set<Page>(["settings"]);

/** Short label shown in the identity plan badge (free is never shown). */
const PLAN_LABEL: Record<LicensePlan, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  team: "Team",
};

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

/**
 * One nav row. Monochrome by default, a subtle inset fill plus an inset teal
 * (--color-cool) left edge when selected — the edge is the non-color-dependent
 * affordance the very-faint inset fill can't carry on its own, and it draws no
 * extra layout box (it's an inset box-shadow, not a border). The icon brightens
 * to ink on selection. The active-count badge is driven by an explicit `count`
 * prop so the badge logic lives in exactly one place (the caller decides which
 * row gets a count). Rhythm — the gap between rows — is owned by the parent flex
 * column, so every row sits on the same beat with no per-item margins.
 */
function NavButton({
  item,
  selected,
  count,
  onNavigate,
}: {
  item: NavItem;
  selected: boolean;
  /** Badge value for this row; 0 (or negative) renders no badge. */
  count: number;
  onNavigate: (page: Page) => void;
}) {
  const showCount = count > 0;
  return (
    <button
      type="button"
      aria-current={selected ? "page" : undefined}
      onClick={() => onNavigate(item.id)}
      className="nav-item flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm"
      style={{
        color: selected ? "var(--color-text)" : "var(--color-muted)",
        fontWeight: selected ? 500 : 400,
        // Selected: faint inset fill + an inset teal edge so the active row is
        // legible without relying on the low-contrast fill alone (a11y).
        ...(selected
          ? {
              backgroundColor: "var(--color-inset)",
              boxShadow: "inset 2px 0 0 0 var(--color-cool)",
            }
          : {}),
      }}
    >
      <span style={{ color: selected ? "var(--color-text)" : "var(--color-faint)" }}>
        <NavGlyph>{item.icon}</NavGlyph>
      </span>
      <span className="flex-1 text-left">{item.label}</span>
      {showCount ? (
        <span className="mono text-[0.625rem] tabular-nums" style={{ color: "var(--color-faint)" }}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function Sidebar({ page, onNavigate, activeCount, status, host }: SidebarProps) {
  const conn = CONN[status];
  const initial = host?.trim().charAt(0).toUpperCase() || "F";

  // Plan badge — visible app-wide once a paid license is active (not just on the
  // Settings page). Reads the shared entitlement context; free/unknown shows none.
  const { entitlement } = useEntitlement();
  const planLabel = isPaid(entitlement) && entitlement ? PLAN_LABEL[entitlement.plan] : null;

  // Cursor's split, derived from NAV by Set membership (reorder-resilient, and a
  // `.filter()` of NavItem[] always yields NavItem[] — never undefined, so no
  // index/undefined guard is needed under noUncheckedIndexedAccess). NAV stays
  // the single source of truth; we only partition a *view* of it here.
  const topItems = NAV.filter((item) => !FOOTER_PAGES.has(item.id));
  const footerItems = NAV.filter((item) => FOOTER_PAGES.has(item.id));

  // The agents row is the only one that shows a live count.
  const countFor = (id: Page): number => (id === "agents" ? activeCount : 0);

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
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium" style={{ color: "var(--color-text)" }}>
              Foundrr
            </p>
            {planLabel ? (
              <span
                className="mono shrink-0 rounded-full px-1.5 py-px text-[0.5rem] uppercase tracking-wider"
                style={{
                  color: "var(--color-signal-ink)",
                  border: "1px solid color-mix(in srgb, var(--color-signal) 45%, transparent)",
                }}
              >
                {planLabel}
              </span>
            ) : null}
          </div>
          <p className="truncate text-[0.6875rem]" style={{ color: "var(--color-faint)" }}>
            {host ? `Local · ${host}` : "Local"}
          </p>
        </div>
      </div>

      {/* Nav — one even rhythm via the column gap. Live-work + Overview flow as a
          single group at the top; the pinned pages sit at the foot, set off by a
          single hairline (the foot section's own `border-t` — no extra spacer
          element, no bespoke margins). Both stacks share one NavButton. */}
      <nav className="flex flex-1 flex-col px-2 pb-3" aria-label="Pages">
        <div className="flex flex-col gap-0.5">
          {topItems.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              selected={page === item.id}
              count={countFor(item.id)}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {footerItems.length > 0 ? (
          <div
            className="mt-auto flex flex-col gap-0.5 border-t pt-2"
            style={{ borderTopColor: "var(--color-line)" }}
          >
            {footerItems.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                selected={page === item.id}
                count={countFor(item.id)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : null}
      </nav>
    </aside>
  );
}

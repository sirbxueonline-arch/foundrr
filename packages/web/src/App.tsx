/**
 * App — the Mission Control dashboard shell.
 *
 * Token gate first: without a token, no data calls are made and a full-screen
 * "token required" notice is shown.
 *
 * Desktop (≥ lg): two full-height columns. Left = Agents (top) + Servers
 * (bottom). Right = Terminal, full height. Servers (M2) and Terminal (M3) are
 * honest placeholders until those milestones land. Agents is fully live.
 *
 * Mobile (< lg): a segmented switch (Agents | Servers | Terminal) showing one
 * surface at a time; defaults to Agents.
 *
 * The page is calm/cool when idle and lights up amber when agents are active.
 */
import { useState } from "react";
import { hasToken } from "./lib/token";
import { useStream } from "./lib/useStream";
import { useNow } from "./lib/useNow";
import { Header } from "./components/Header";
import { AgentsPanel } from "./components/AgentsPanel";
import { ServersPanel } from "./components/ServersPanel";
import { TerminalTabs } from "./components/TerminalTabs";
import { ApprovalBanner } from "./components/ApprovalBanner";
import { TelegramStatus } from "./components/TelegramStatus";
import { AccessPanel } from "./components/AccessPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";

type Surface = "agents" | "servers" | "terminal";

const SURFACES: { id: Surface; label: string }[] = [
  { id: "agents", label: "Agents" },
  { id: "servers", label: "Servers" },
  { id: "terminal", label: "Terminal" },
];

function TokenRequired() {
  return (
    <div
      className="flex h-full min-h-screen items-center justify-center px-6"
      style={{ backgroundColor: "var(--color-void)" }}
    >
      <div className="panel max-w-md p-8 text-center">
        <h1 className="text-sm font-bold tracking-[0.18em]" style={{ color: "var(--color-text)" }}>
          MISSION CONTROL
        </h1>
        <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
          An access token is required.
        </p>
        <p className="mono mt-3 text-xs leading-relaxed" style={{ color: "var(--color-faint)" }}>
          Open the dashboard using the URL the daemon printed on first run —
          it includes <code style={{ color: "var(--color-cool)" }}>?token=…</code>.
        </p>
      </div>
    </div>
  );
}

export function App() {
  // Top-level boundary: nothing below this can ever produce a blank page.
  // Worst case the user sees a readable error + a Reload button.
  return (
    <ErrorBoundary label="Founder">
      <AppShell />
    </ErrorBoundary>
  );
}

function AppShell() {
  const [surface, setSurface] = useState<Surface>("agents");

  // Token gate — render the notice before any hook that would make data calls.
  if (!hasToken()) {
    return <TokenRequired />;
  }

  return <Dashboard surface={surface} onSurfaceChange={setSurface} />;
}

interface DashboardProps {
  surface: Surface;
  onSurfaceChange: (s: Surface) => void;
}

function Dashboard({ surface, onSurfaceChange }: DashboardProps) {
  const { sessions, servers, approvals, cost, status, serverTime } = useStream();
  const now = useNow(serverTime);

  // The "Access from anywhere" drawer — opened from the Header's Connect button.
  const [accessOpen, setAccessOpen] = useState(false);
  // Bumped to remount the terminal subtree when its boundary is reset, giving
  // the user a clean retry without reloading the whole dashboard.
  const [terminalKey, setTerminalKey] = useState(0);

  const activeCount = sessions.filter(
    (s) => s.status === "active" || s.status === "waiting",
  ).length;

  const agents = <AgentsPanel sessions={sessions} now={now} cost={cost} />;
  const serversPanel = <ServersPanel servers={servers} />;

  // A terminal/xterm crash is contained to this boundary — the Agents and
  // Servers panels stay usable. "Try again" remounts a fresh TerminalTabs.
  const terminal = (
    <ErrorBoundary
      label="Terminal"
      onReset={() => setTerminalKey((k) => k + 1)}
    >
      <TerminalTabs key={terminalKey} />
    </ErrorBoundary>
  );

  return (
    <div className="flex h-screen flex-col" style={{ backgroundColor: "var(--color-void)" }}>
      {/* Crown jewel: pinned to the very top of the shell so a pending approval
          overlays everything on both desktop and mobile. Renders nothing when
          there are no pending approvals (no layout shift). */}
      <ApprovalBanner approvals={approvals} />

      <Header
        status={status}
        activeCount={activeCount}
        cost={cost}
        telegram={<TelegramStatus />}
        onOpenAccess={() => setAccessOpen(true)}
      />

      {accessOpen ? <AccessPanel onClose={() => setAccessOpen(false)} /> : null}

      {/* Mobile segmented switch (< lg) — a single inset control so the active
          surface reads as a clearly raised segment. */}
      <nav
        className="flex gap-1 border-b p-2 hairline lg:hidden"
        aria-label="Dashboard sections"
        role="tablist"
      >
        <div
          className="flex flex-1 gap-1 rounded-lg p-1"
          style={{ backgroundColor: "var(--color-void)", border: "1px solid var(--color-line)" }}
        >
          {SURFACES.map((s) => {
            const selected = surface === s.id;
            const showCount = s.id === "agents" && activeCount > 0;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSurfaceChange(s.id)}
                className="mono flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs tracking-wide transition-colors"
                style={{
                  color: selected ? "var(--color-text)" : "var(--color-muted)",
                  backgroundColor: selected ? "var(--color-panel)" : "transparent",
                  border: `1px solid ${selected ? "var(--color-line)" : "transparent"}`,
                }}
              >
                {s.label}
                {showCount ? (
                  <span
                    className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1 text-[0.625rem] tabular-nums"
                    style={{
                      color: "var(--color-signal)",
                      backgroundColor: "color-mix(in srgb, var(--color-signal) 15%, transparent)",
                    }}
                  >
                    {activeCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile: one surface at a time.
          Agents/Servers scroll inside a padded main; the Terminal instead gets
          a fixed full-height (viewport-minus-chrome) non-scrolling panel so the
          fit addon has a real box and the on-screen keyboard reflows it. The
          terminal main uses tight padding so xterm fills the available height. */}
      {surface === "terminal" ? (
        <main className="min-h-0 flex-1 p-1.5 lg:hidden">
          <section className="panel flex h-full min-h-0 flex-col overflow-hidden" aria-label="Terminal">
            {terminal}
          </section>
        </main>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto p-3 lg:hidden">
          {surface === "agents" && agents}
          {surface === "servers" && serversPanel}
        </main>
      )}

      {/* Desktop: two full-height columns. */}
      <div className="hidden min-h-0 flex-1 lg:grid lg:grid-cols-2 lg:gap-3 lg:p-3">
        <div className="flex min-h-0 flex-col gap-3">
          <section className="flex min-h-0 flex-1 flex-col gap-2" aria-label="Agents">
            <div className="flex shrink-0 items-center gap-2 px-1">
              <h2 className="section-label">Agents</h2>
              {activeCount > 0 ? (
                <span
                  className="mono text-[0.625rem] tabular-nums"
                  style={{ color: "var(--color-signal)" }}
                >
                  {activeCount} active
                </span>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{agents}</div>
          </section>
          <section className="flex min-h-[10rem] flex-1 flex-col gap-2" aria-label="Servers">
            <h2 className="section-label shrink-0 px-1">Servers</h2>
            <div className="panel min-h-0 flex-1 overflow-y-auto p-2">{serversPanel}</div>
          </section>
        </div>
        <section className="flex min-h-0 flex-col gap-2" aria-label="Terminal">
          <h2 className="section-label shrink-0 px-1">Terminal</h2>
          <div className="panel min-h-0 flex-1 overflow-hidden">{terminal}</div>
        </section>
      </div>
    </div>
  );
}

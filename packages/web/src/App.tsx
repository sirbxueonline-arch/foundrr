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

  const activeCount = sessions.filter(
    (s) => s.status === "active" || s.status === "waiting",
  ).length;

  const agents = <AgentsPanel sessions={sessions} now={now} cost={cost} />;
  const serversPanel = <ServersPanel servers={servers} />;

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

      {/* Mobile segmented switch (< lg). */}
      <nav
        className="flex gap-1 border-b p-2 hairline lg:hidden"
        aria-label="Dashboard sections"
        role="tablist"
      >
        {SURFACES.map((s) => {
          const selected = surface === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSurfaceChange(s.id)}
              className="mono flex-1 rounded-md px-3 py-2 text-xs tracking-wide transition-colors"
              style={{
                color: selected ? "var(--color-text)" : "var(--color-muted)",
                backgroundColor: selected ? "var(--color-panel)" : "transparent",
                border: `1px solid ${selected ? "var(--color-line)" : "transparent"}`,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </nav>

      {/* Mobile: one surface at a time.
          Agents/Servers scroll inside a padded main; the Terminal instead gets
          a fixed full-height (viewport-minus-chrome) non-scrolling panel so the
          fit addon has a real box and the on-screen keyboard reflows it. The
          terminal main uses tight padding so xterm fills the available height. */}
      {surface === "terminal" ? (
        <main className="min-h-0 flex-1 p-1.5 lg:hidden">
          <section className="panel flex h-full min-h-0 flex-col overflow-hidden" aria-label="Terminal">
            <TerminalTabs />
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
          <section
            className="min-h-0 flex-1 overflow-y-auto"
            aria-label="Agents"
          >
            {agents}
          </section>
          <section
            className="panel min-h-[10rem] flex-1 overflow-y-auto p-2"
            aria-label="Servers"
          >
            {serversPanel}
          </section>
        </div>
        <section className="panel min-h-0 overflow-hidden" aria-label="Terminal">
          <TerminalTabs />
        </section>
      </div>
    </div>
  );
}

/**
 * App — the Foundrr dashboard shell.
 *
 * Token gate first: without a token, no data calls are made and a full-screen
 * "token required" notice is shown.
 *
 * Layout: a left SIDEBAR (desktop) / bottom tab bar (mobile) switches between
 * full-width pages — Agents, Changes, Servers, Terminal, Stats. The sidebar also
 * holds the model picker, Connect, cost meter, and connection status, so the top
 * of each page is uncluttered (on mobile those controls live in a slim header).
 *
 * The page is calm/cool when idle and lights up amber when agents are active.
 */
import { useCallback, useEffect, useState } from "react";
import { hasToken } from "./lib/token";
import { getConfig, getAgents, type LaunchableAgent } from "./lib/api";
import { useStream } from "./lib/useStream";
import { useNow } from "./lib/useNow";
import { Header } from "./components/Header";
import { Sidebar, NAV, type Page } from "./components/Sidebar";
import { AgentsPanel } from "./components/AgentsPanel";
import { ServersPanel } from "./components/ServersPanel";
import { ChangesPage } from "./components/ChangesPage";
import { StatsPage } from "./components/StatsPage";
import { SettingsPage } from "./components/SettingsPage";
import { TerminalTabs } from "./components/TerminalTabs";
import { ApprovalBanner } from "./components/ApprovalBanner";
import { TelegramStatus } from "./components/TelegramStatus";
import { AccessPanel } from "./components/AccessPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Onboarding } from "./components/Onboarding";

function TokenRequired() {
  return (
    <div
      className="flex h-full min-h-screen items-center justify-center px-6"
      style={{ backgroundColor: "var(--color-void)" }}
    >
      <div className="panel max-w-md p-8 text-center">
        <h1
          className="flex items-center justify-center gap-2 text-xl font-light tracking-tight"
          style={{ color: "var(--color-text)" }}
        >
          <span aria-hidden="true" style={{ color: "var(--color-signal-ink)" }}>
            ◆
          </span>
          Foundrr
        </h1>
        <p className="mt-4 text-sm font-light leading-relaxed" style={{ color: "var(--color-muted)" }}>
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
  return (
    <ErrorBoundary label="Foundrr">
      <AppShell />
    </ErrorBoundary>
  );
}

function AppShell() {
  // Token gate — render the notice before any hook that would make data calls.
  if (!hasToken()) {
    return <TokenRequired />;
  }
  return <Dashboard />;
}

/** Mobile bottom tab bar — the same pages as the desktop rail. */
function MobileNav({
  page,
  onNavigate,
  activeCount,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  activeCount: number;
}) {
  return (
    <nav
      className="flex shrink-0 border-t hairline lg:hidden"
      style={{ backgroundColor: "var(--color-void)" }}
      aria-label="Pages"
    >
      {NAV.map((item) => {
        const selected = page === item.id;
        const showCount = item.id === "agents" && activeCount > 0;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
            className="relative flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1 py-1.5 text-[0.625rem] tracking-wide transition-colors"
            style={{ color: selected ? "var(--color-signal-ink)" : "var(--color-muted)" }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {item.icon}
            </svg>
            <span>{item.label}</span>
            {showCount ? (
              <span
                className="absolute right-1/2 top-1 mr-2 inline-flex min-w-[1rem] items-center justify-center rounded-full px-1 text-[0.5625rem] tabular-nums"
                style={{
                  color: "var(--color-signal-ink)",
                  backgroundColor: "color-mix(in srgb, var(--color-signal) 20%, transparent)",
                }}
              >
                {activeCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

function Dashboard() {
  const { sessions, servers, approvals, cost, status, serverTime } = useStream();
  const now = useNow(serverTime);

  const [page, setPage] = useState<Page>("agents");
  // The selected model key, lifted so the picker and the terminal launch stay in
  // lockstep. null = not loaded yet; seeded from /api/config, then owned locally.
  const [model, setModel] = useState<string | null>(null);
  const [agentsState, setAgentsState] = useState<LaunchableAgent[] | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  // Bumped to remount the terminal subtree when its boundary resets.
  const [terminalKey, setTerminalKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getConfig()
      .then((config) => {
        if (!cancelled) setModel(config.model);
      })
      .catch(() => {
        if (!cancelled) setModel(null);
      });
    getAgents()
      .then((list) => {
        if (!cancelled) setAgentsState(list);
      })
      .catch(() => {
        if (!cancelled) setAgentsState(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onModelChange = useCallback((next: string): void => {
    setModel(next);
  }, []);

  const activeCount = sessions.filter(
    (s) => s.status === "active" || s.status === "waiting",
  ).length;

  const host = typeof window !== "undefined" ? window.location.hostname : "";

  // The terminal stays mounted across page switches (display:none when hidden) so
  // its PTY/buffer survive navigation. A crash is contained to this boundary.
  const terminal = (
    <ErrorBoundary label="Terminal" onReset={() => setTerminalKey((k) => k + 1)}>
      <TerminalTabs key={terminalKey} model={model} />
    </ErrorBoundary>
  );

  return (
    <div className="flex h-screen flex-col" style={{ backgroundColor: "var(--color-void)" }}>
      {/* Crown jewel: a pending approval overlays everything, full width on top. */}
      <ApprovalBanner approvals={approvals} />
      {/* One-time first-run tour (self-gates on localStorage). */}
      <Onboarding />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Desktop rail (holds nav + the de-crammed header controls). */}
        <Sidebar
          page={page}
          onNavigate={setPage}
          activeCount={activeCount}
          status={status}
          host={host}
        />

        {/* Mobile top bar — the same controls in a slim header. */}
        <div className="lg:hidden">
          <Header
            status={status}
            activeCount={activeCount}
            cost={cost}
            telegram={<TelegramStatus />}
            onOpenAccess={() => setAccessOpen(true)}
            model={model}
            agents={agentsState}
            onModelChange={onModelChange}
          />
        </div>

        {/* The active page, full width. The terminal keeps a real box for its fit
            addon; the scrolling pages share a padded, scrollable main. The
            terminal subtree is always mounted (hidden when off-page) so its PTY
            survives page switches. */}
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className="h-full p-1.5 lg:p-3"
            style={{ display: page === "terminal" ? "block" : "none" }}
          >
            <section className="panel flex h-full min-h-0 flex-col overflow-hidden" aria-label="Terminal">
              {terminal}
            </section>
          </div>

          {page !== "terminal" ? (
            <div className="h-full overflow-y-auto p-3 lg:p-4">
              {page === "agents" && <AgentsPanel sessions={sessions} now={now} cost={cost} />}
              {page === "changes" && <ChangesPage sessions={sessions} />}
              {page === "servers" && <ServersPanel servers={servers} />}
              {page === "stats" && <StatsPage sessions={sessions} cost={cost} now={now} />}
              {page === "settings" && (
                <SettingsPage
                  model={model}
                  agents={agentsState}
                  onModelChange={onModelChange}
                  cost={cost}
                  status={status}
                  host={host}
                  onOpenAccess={() => setAccessOpen(true)}
                />
              )}
            </div>
          ) : null}
        </main>
      </div>

      {/* Mobile bottom nav. */}
      <MobileNav page={page} onNavigate={setPage} activeCount={activeCount} />

      {accessOpen ? <AccessPanel onClose={() => setAccessOpen(false)} /> : null}
    </div>
  );
}

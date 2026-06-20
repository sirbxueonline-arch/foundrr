/**
 * TerminalTabs — the M3 terminal surface: a tab bar plus the active Terminal.
 *
 * Each tab is one PTY (one WS /term). New tabs are minted with a fresh
 * crypto.randomUUID() id and a chosen shell:
 *   - "+ Shell"      → the daemon's default login shell.
 *   - "+ <Model>"    → spawns the currently-picked agent's CLI (shell === the
 *                      model key, e.g. "claude-code" → `claude`). The daemon
 *                      detects whether that CLI is installed and, if not, sends
 *                      an error frame the terminal panel renders.
 *
 * All open tabs stay MOUNTED; inactive ones are hidden with CSS rather than
 * unmounted, so their socket stays live and background output / scrollback is
 * never lost when switching tabs.
 *
 * Tabs are closeable (× → DELETE /api/term/:id, then drop locally). Open tab
 * ids are persisted to sessionStorage so a reload keeps the same tabs, and on
 * first mount we reconcile against the daemon's live sessions (GET /api/term)
 * so we don't show tabs whose PTYs already died.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { modelByKey } from "@mission-control/shared";
import { killTerminal, listTerminals } from "../lib/api";
import { Terminal, type TerminalHandle } from "./Terminal";
import { TerminalInputBar } from "./TerminalInputBar";

interface TerminalTabsProps {
  /**
   * The selected model key (lifted from App). The agent launch button follows
   * it: "+ <ModelName>" opens a terminal with `shell=<modelKey>`. null until
   * loaded. A model with no CLI command (IDE-based) disables the button.
   */
  model: string | null;
}

interface TermTab {
  id: string;
  /**
   * What to spawn: "shell" (the default login shell) or a model key (e.g.
   * "claude-code") that the daemon maps to the agent's CLI.
   */
  shell: string;
  /** Human label shown on the tab. */
  label: string;
}

const STORAGE_KEY = "mc.term.tabs";

/**
 * The dark "console" background for the terminal pane region. The dashboard is
 * light, but the terminal stays a dark inset (Claude Code's TUI needs a dark
 * bg). Hard-coded dark — matches Terminal.tsx's CONSOLE_BG / xterm background —
 * so it is decoupled from the now-light surface tokens.
 */
const TERMINAL_CONSOLE_BG = "#0d1014";

interface StoredTab {
  id: string;
  shell: string;
  label: string;
}

function loadStoredTabs(): TermTab[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is StoredTab => {
        const candidate = t as Partial<StoredTab>;
        return (
          typeof candidate.id === "string" &&
          typeof candidate.shell === "string" &&
          typeof candidate.label === "string"
        );
      })
      .map((t) => ({ id: t.id, shell: t.shell, label: t.label }));
  } catch {
    return [];
  }
}

function persistTabs(tabs: TermTab[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // sessionStorage may be unavailable (private mode) — non-fatal.
  }
}

function nextLabel(existing: TermTab[], base: string): string {
  // Use the highest suffix already in use (not the COUNT) so closing an earlier
  // tab can't make the next one collide with a surviving label — e.g. open
  // "Shell","Shell 2","Shell 3", close "Shell 2", then the next is "Shell 4".
  const siblings = existing.filter(
    (t) => t.label === base || t.label.startsWith(`${base} `),
  );
  if (siblings.length === 0) return base;
  let max = 1; // a bare `base` occupies index 1
  for (const t of siblings) {
    if (t.label === base) continue;
    const n = Number.parseInt(t.label.slice(base.length + 1), 10);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${base} ${max + 1}`;
}

/**
 * Map a daemon-reported `shell` back to a launch value when adopting a live tab.
 * A known model key passes through; legacy "claude" maps to "claude-code"; a
 * shell path (or anything else) becomes "shell".
 */
function adoptShell(shell: string): string {
  if (modelByKey(shell)) return shell;
  if (shell === "claude") return "claude-code";
  return "shell";
}

/**
 * Secure-context-safe random id. `crypto.randomUUID()` only exists in a secure
 * context (HTTPS or localhost); when Foundrr is opened over plain HTTP on a LAN
 * IP (e.g. http://192.168.x.x:7878 from a phone) it is undefined and throws.
 * Fall back to getRandomValues, then to a non-crypto id — these are just local
 * tab identifiers, not security tokens.
 */
function randomId(): string {
  const c: Crypto | undefined = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    b[6] = (b[6]! & 0x0f) | 0x40;
    b[8] = (b[8]! & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function TerminalTabs({ model }: TerminalTabsProps) {
  const [tabs, setTabs] = useState<TermTab[]>(() => loadStoredTabs());
  const [activeId, setActiveId] = useState<string | null>(
    () => loadStoredTabs()[0]?.id ?? null,
  );
  const mountedRef = useRef(true);
  // Per-terminal imperative handles, keyed by tab id. Populated by each mounted
  // Terminal's ref callback so the input bar / viewport effect can reach the
  // active one without prop-drilling.
  const handlesRef = useRef<Map<string, TerminalHandle>>(new Map());
  // Bumped when handles are attached/detached so the active-handle memo (read by
  // the input bar) recomputes once the active terminal's ref is live.
  const [handleVersion, setHandleVersion] = useState(0);

  const setHandle = useCallback((id: string, handle: TerminalHandle | null): void => {
    // Guard: only react to a genuine attach/detach, never to repeated calls
    // with the same handle — that churn is what loops re-renders.
    const current = handlesRef.current.get(id) ?? null;
    if (current === handle) return;
    if (handle) handlesRef.current.set(id, handle);
    else handlesRef.current.delete(id);
    setHandleVersion((v) => v + 1);
  }, []);

  // Stable callback-ref per tab id. An inline `ref={(h) => setHandle(id, h)}`
  // gets a NEW identity every render, so React calls it with null then the
  // handle on EVERY commit — and the setHandle bump would re-render forever
  // (React error #185 "Maximum update depth exceeded"). Caching one callback
  // per id keeps the ref identity stable, so React invokes it only on a real
  // mount/unmount.
  const refCbsRef = useRef<Map<string, (h: TerminalHandle | null) => void>>(
    new Map(),
  );
  const handleRefFor = useCallback(
    (id: string) => {
      let cb = refCbsRef.current.get(id);
      if (!cb) {
        cb = (h: TerminalHandle | null): void => setHandle(id, h);
        refCbsRef.current.set(id, cb);
      }
      return cb;
    },
    [setHandle],
  );

  // Persist whenever the tab set changes.
  useEffect(() => {
    persistTabs(tabs);
  }, [tabs]);

  // The on-screen keyboard shrinks the visual viewport rather than the layout
  // viewport, which can hide the prompt behind it. Refit the active terminal on
  // every visualViewport resize so xterm reflows into the now-smaller box and
  // the PTY tracks it. No-op where visualViewport is unsupported.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = (): void => {
      if (!activeId) return;
      handlesRef.current.get(activeId)?.refit();
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [activeId]);

  // The handle for the currently-active terminal, fed to the input bar. Recomputed
  // when the active tab changes or a handle attaches/detaches.
  const activeHandle = useMemo<TerminalHandle | null>(
    () => (activeId ? handlesRef.current.get(activeId) ?? null : null),
    // handleVersion participates so a late ref attach refreshes the bar.
    [activeId, handleVersion],
  );

  // On first mount, reconcile persisted ids against the daemon's live sessions
  // so we drop tabs whose PTY no longer exists. If the daemon has sessions we
  // don't know about (opened elsewhere), adopt them too.
  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      try {
        const live = await listTerminals();
        if (!mountedRef.current) return;
        const liveById = new Map(live.map((t) => [t.id, t]));
        setTabs((prev) => {
          const kept = prev.filter((t) => liveById.has(t.id));
          const keptIds = new Set(kept.map((t) => t.id));
          const adopted: TermTab[] = live
            .filter((t) => !keptIds.has(t.id))
            .map((t) => {
              // The daemon reports the launch key in `shell`: a model key (e.g.
              // "claude-code"), the legacy "claude", or a shell path. Map it back
              // to a launch value + a friendly label.
              const launched = adoptShell(t.shell);
              const fallback = modelByKey(launched)?.name ?? "Shell";
              return { id: t.id, shell: launched, label: t.title || fallback };
            });
          const next = [...kept, ...adopted];
          return next;
        });
      } catch {
        // Daemon unreachable or no /api/term yet: keep persisted tabs as-is and
        // rely on per-socket reconnect / scrollback replay.
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Keep activeId valid as tabs change.
  useEffect(() => {
    if (tabs.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!activeId || !tabs.some((t) => t.id === activeId)) {
      setActiveId(tabs[0]?.id ?? null);
    }
  }, [tabs, activeId]);

  const openTab = useCallback((shell: string, base: string): void => {
    // Generate the id and select the tab OUTSIDE the updater — calling another
    // setter inside setTabs's reducer is an anti-pattern that can double-fire
    // under StrictMode/concurrent rendering. nextLabel still reads `prev`.
    const id = randomId();
    setTabs((prev) => [...prev, { id, shell, label: nextLabel(prev, base) }]);
    setActiveId(id);
  }, []);

  const closeTab = useCallback((id: string): void => {
    // Drop locally first for instant feedback; killing the PTY is best-effort.
    handlesRef.current.delete(id);
    setTabs((prev) => prev.filter((t) => t.id !== id));
    void killTerminal(id).catch(() => undefined);
  }, []);

  // The agent launch button follows the picked model. Only a model with a CLI
  // `command` is launchable; IDE-based ones disable the button with a tooltip.
  // `agentLaunch` carries the launch key + display name when launchable.
  const selectedModel = model ? modelByKey(model) : undefined;
  const agentLaunch =
    selectedModel && selectedModel.command
      ? { key: selectedModel.key, name: selectedModel.name }
      : null;
  const agentLabel = selectedModel ? `+ ${selectedModel.name}` : "+ Agent";
  const agentTitle = agentLaunch
    ? `Launch ${agentLaunch.name} in a terminal`
    : selectedModel
      ? `${selectedModel.name} is IDE-based — no terminal agent. Pick Claude/Codex/Gemini, or use + Shell.`
      : "Loading model…";

  // Name of the AI in the ACTIVE tab (null for a plain shell) — feeds the input
  // bar so its placeholder addresses whichever agent is in focus, not just Claude.
  const activeTab = tabs.find((t) => t.id === activeId);
  const activeAgentName = activeTab ? modelByKey(activeTab.shell)?.name ?? null : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Tab bar — a LIGHT strip above the dark console inset: hairline bottom,
          sits on the canvas so it reads as part of the light dashboard chrome.
          The active tab is marked with a thin amber underline + amber-ink label
          (the live frame); inactive tabs carry no border — whitespace separates
          them. */}
      <div
        className="flex flex-col gap-1.5 border-b p-1.5 hairline sm:flex-row sm:items-center sm:gap-1"
        role="tablist"
        aria-label="Terminal tabs"
        style={{ backgroundColor: "var(--color-void)" }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const selected = tab.id === activeId;
            return (
              <div
                key={tab.id}
                className="mono flex min-h-10 shrink-0 items-center rounded-md text-xs sm:min-h-0"
                style={{
                  // Amber-ink label on the active tab (AA on the light strip);
                  // inactive tabs read muted.
                  color: selected ? "var(--color-signal-ink)" : "var(--color-muted)",
                  backgroundColor: "transparent",
                  // A thin amber underline marks the active tab; inactive tabs
                  // carry no border at all — whitespace separates them.
                  borderBottom: `1.5px solid ${selected ? "var(--color-signal)" : "transparent"}`,
                  borderRadius: 0,
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveId(tab.id)}
                  className="px-2 py-1 tracking-wide"
                  style={{ color: "inherit" }}
                >
                  {tab.label}
                </button>
                <button
                  type="button"
                  onClick={() => closeTab(tab.id)}
                  aria-label={`Close ${tab.label}`}
                  title={`Close ${tab.label}`}
                  className="px-1.5 py-1 transition-colors"
                  style={{ color: "var(--color-faint)" }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => openTab("shell", "Shell")}
            className="pill pill-cool"
          >
            + Shell
          </button>
          {/* The agent launch is the live/primary action — amber-outlined. */}
          <button
            type="button"
            onClick={() => agentLaunch && openTab(agentLaunch.key, agentLaunch.name)}
            disabled={!agentLaunch}
            title={agentTitle}
            className="pill pill-primary"
          >
            {agentLabel}
          </button>
        </div>
      </div>

      {/* The dark console inset: the xterm panes (or the empty state) live on a
          dark background so Claude Code's TUI colors read correctly, framed as a
          recessed dark pane within the light terminal chrome. */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ backgroundColor: TERMINAL_CONSOLE_BG }}
      >
        {tabs.length === 0 ? (
          <div
            className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
            style={{ backgroundColor: TERMINAL_CONSOLE_BG }}
          >
            <p className="text-sm" style={{ color: "#8a95a3" }}>
              No terminal open.
            </p>
            <p className="text-sm" style={{ color: "#5b6573" }}>
              Start a <span className="mono" style={{ color: "#56b6c2" }}>+ Shell</span> or{" "}
              <span className="mono" style={{ color: "#f2a23c" }}>{agentLabel}</span> session.
            </p>
          </div>
        ) : (
          tabs.map((tab) => (
            <div
              key={tab.id}
              className="absolute inset-0"
              // Inactive panels stay mounted but hidden — keeps the WS + buffer.
              style={{ display: tab.id === activeId ? "block" : "none" }}
              role="tabpanel"
              aria-hidden={tab.id !== activeId}
            >
              <Terminal
                ref={handleRefFor(tab.id)}
                id={tab.id}
                shell={tab.shell}
                active={tab.id === activeId}
              />
            </div>
          ))
        )}
      </div>

      {/* Mobile-friendly input: special-keys bar + command bar, wired to the
          active terminal. Shown whenever a terminal is open; tasteful on desktop
          too. Sits below the terminal so it never overlaps the scrollback. */}
      {tabs.length > 0 ? (
        <TerminalInputBar target={activeHandle} agentLabel={activeAgentName} />
      ) : null}
    </div>
  );
}

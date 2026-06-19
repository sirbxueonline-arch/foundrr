/**
 * TerminalTabs — the M3 terminal surface: a tab bar plus the active Terminal.
 *
 * Each tab is one PTY (one WS /term). New tabs are minted with a fresh
 * crypto.randomUUID() id and a chosen shell:
 *   - "+ Shell"  → the daemon's default login shell.
 *   - "+ Claude" → spawns the `claude` CLI (shell === "claude").
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
import { killTerminal, listTerminals } from "../lib/api";
import { Terminal, type TerminalHandle } from "./Terminal";
import { TerminalInputBar } from "./TerminalInputBar";

interface TermTab {
  id: string;
  /** "claude" or "shell" — what to spawn; "shell" maps to the default shell. */
  shell: string;
  /** Human label shown on the tab. */
  label: string;
}

const STORAGE_KEY = "mc.term.tabs";

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
  const used = existing.filter((t) => t.label.startsWith(base)).length;
  return used === 0 ? base : `${base} ${used + 1}`;
}

export function TerminalTabs() {
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
            .map((t) => ({
              id: t.id,
              shell: t.shell === "claude" ? "claude" : "shell",
              label: t.title || (t.shell === "claude" ? "Claude" : "Shell"),
            }));
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
    setTabs((prev) => {
      const id = crypto.randomUUID();
      const tab: TermTab = { id, shell, label: nextLabel(prev, base) };
      setActiveId(id);
      return [...prev, tab];
    });
  }, []);

  const closeTab = useCallback((id: string): void => {
    // Drop locally first for instant feedback; killing the PTY is best-effort.
    handlesRef.current.delete(id);
    setTabs((prev) => prev.filter((t) => t.id !== id));
    void killTerminal(id).catch(() => undefined);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Tab bar */}
      <div
        className="flex items-center gap-1 border-b p-1 hairline"
        role="tablist"
        aria-label="Terminal tabs"
        style={{ backgroundColor: "var(--color-panel)" }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const selected = tab.id === activeId;
            return (
              <div
                key={tab.id}
                className="mono flex shrink-0 items-center rounded-md text-xs"
                style={{
                  color: selected ? "var(--color-text)" : "var(--color-muted)",
                  backgroundColor: selected ? "var(--color-void)" : "transparent",
                  border: `1px solid ${selected ? "var(--color-line)" : "transparent"}`,
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

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => openTab("shell", "Shell")}
            className="mono rounded-md px-2 py-1 text-xs tracking-wide transition-colors"
            style={{ color: "var(--color-cool)", border: "1px solid var(--color-line)" }}
          >
            + Shell
          </button>
          <button
            type="button"
            onClick={() => openTab("claude", "Claude")}
            className="mono rounded-md px-2 py-1 text-xs tracking-wide transition-colors"
            style={{ color: "var(--color-signal)", border: "1px solid var(--color-line)" }}
          >
            + Claude
          </button>
        </div>
      </div>

      {/* Active terminal (all mounted; inactive hidden to preserve sockets) */}
      <div className="relative min-h-0 flex-1">
        {tabs.length === 0 ? (
          <div
            className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
            style={{ backgroundColor: "var(--color-void)" }}
          >
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              No terminal open.
            </p>
            <p className="text-sm" style={{ color: "var(--color-faint)" }}>
              Start a <span className="mono" style={{ color: "var(--color-cool)" }}>+ Shell</span> or{" "}
              <span className="mono" style={{ color: "var(--color-signal)" }}>+ Claude</span> session.
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
      {tabs.length > 0 ? <TerminalInputBar target={activeHandle} /> : null}
    </div>
  );
}

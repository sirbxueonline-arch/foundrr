/**
 * ServersPanel — the M2 surface.
 *
 * Data sources:
 *   - Live detected servers arrive via the WS `servers` message (passed in as
 *     `servers` from useStream) — these are processes currently listening.
 *   - Registered servers (persisted launch recipes) come from REST. We refetch
 *     them on mount, after every mutation, and on a light interval so a server
 *     started/stopped elsewhere reconciles.
 *
 * Reconciliation (detected ↔ registered):
 *   A detected server carries an optional `registeredId`. We index registered
 *   servers by id and fold each detected server into its matching registered
 *   entry when the ids line up; otherwise the detected server stands alone.
 *   Registered servers with no live process still render (so the user can
 *   Start them). Listening entries sort first.
 *
 * Actions run one-at-a-time per row with a pending/disabled state and inline
 * error surfacing. After any successful mutation we scan + refetch so the row
 * reflects reality without waiting for the next WS frame.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DetectedServer, RegisteredServer } from "@mission-control/shared";
import { EmptyState } from "./EmptyState";
import { ServerRow, type ServerAction, type ServerEntry } from "./ServerRow";
import { isWebServer } from "../lib/serverKind";
import { RegisterServerForm } from "./RegisterServerForm";
import {
  ApiError,
  deleteRegistered,
  exposeServer,
  listRegistered,
  restartRegistered,
  scanServers,
  startRegistered,
  stopProcess,
  stopRegistered,
  unexposeServer,
} from "../lib/api";
import { previewOpenUrl } from "../lib/preview";

interface ServersPanelProps {
  /** Live detected servers from the WS stream (useStream().servers). */
  servers: DetectedServer[];
}

const REGISTERED_REFRESH_MS = 10_000;

/**
 * Merge detected (live) servers with registered (recipe) servers into a single
 * de-duplicated list, reconciling by `registeredId`. Listening entries first,
 * then by port / name for a stable order.
 */
function mergeEntries(
  detected: DetectedServer[],
  registered: RegisteredServer[],
): ServerEntry[] {
  const byRegId = new Map<string, RegisteredServer>();
  for (const r of registered) byRegId.set(r.id, r);

  const entries: ServerEntry[] = [];
  const matchedRegIds = new Set<string>();

  for (const d of detected) {
    const reg = d.registeredId ? byRegId.get(d.registeredId) : undefined;
    if (reg) matchedRegIds.add(reg.id);
    entries.push({
      key: reg ? reg.id : `${d.pid}@${d.port}`,
      detected: d,
      registered: reg,
    });
  }

  // Registered servers with no live process — still shown so they can be Started.
  for (const r of registered) {
    if (matchedRegIds.has(r.id)) continue;
    entries.push({ key: r.id, registered: r });
  }

  return entries.sort((a, b) => {
    const aLive = a.detected ? 0 : 1;
    const bLive = b.detected ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;
    const aPort = a.detected?.port ?? Number.MAX_SAFE_INTEGER;
    const bPort = b.detected?.port ?? Number.MAX_SAFE_INTEGER;
    if (aPort !== bPort) return aPort - bPort;
    return (a.registered?.name ?? "").localeCompare(b.registered?.name ?? "");
  });
}

function actionErrorMessage(action: ServerAction, err: unknown): string {
  const verb = action.charAt(0).toUpperCase() + action.slice(1);
  if (err instanceof ApiError) return `${verb} failed (${err.status})`;
  if (err instanceof Error) return `${verb} failed: ${err.message}`;
  return `${verb} failed`;
}

export function ServersPanel({ servers }: ServersPanelProps) {
  const [registered, setRegistered] = useState<RegisteredServer[]>([]);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Default to DEV servers only — hide the OS background processes (Spotify,
  // ControlCenter, rapportd, …) that merely hold a port. Toggle to reveal them
  // (you can still STOP a rogue background process from there).
  const [showAll, setShowAll] = useState(false);
  const mountedRef = useRef(true);

  const refetchRegistered = useCallback(async (): Promise<void> => {
    try {
      const list = await listRegistered();
      if (mountedRef.current) setRegistered(list);
    } catch {
      // Non-fatal: keep the last-known list; per-action errors surface inline.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refetchRegistered();
    const timer = setInterval(() => void refetchRegistered(), REGISTERED_REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refetchRegistered]);

  const allEntries = mergeEntries(servers, registered);
  // Dev servers = registered recipes + anything that looks like a real web/dev
  // server; everything else is OS background noise the founder doesn't care about.
  const devEntries = allEntries.filter(isWebServer);
  const hiddenCount = allEntries.length - devEntries.length;
  const entries = showAll ? allEntries : devEntries;

  const runAction = useCallback(
    async (entry: ServerEntry, action: Exclude<ServerAction, "open">): Promise<void> => {
      if (pendingKey) return; // one action at a time across the panel.
      setPendingKey(entry.key);
      setErrors((prev) => {
        const next = { ...prev };
        delete next[entry.key];
        return next;
      });

      // Pre-open a blank tab for Preview *synchronously* inside the click so
      // mobile popup blockers don't suppress it after the await, then navigate it
      // once the proxy is mounted. The preview is same-origin (no separate port,
      // no mixed content), so it opens in every context the dashboard does.
      // NOTE: no "noopener" here — that makes window.open() return null, leaving
      // the blank tab stranded on about:blank (we'd have no handle to navigate).
      // The target is the user's own dev server on the same origin, so opener
      // access is fine.
      // Only pre-open a tab when there's a real port to navigate it to, so an
      // expose on a port-less entry never strands a blank about:blank tab.
      const previewWindow =
        action === "expose" && entry.detected?.port !== undefined
          ? window.open("", "_blank")
          : null;

      try {
        const regId = entry.registered?.id;
        const pid = entry.detected?.pid;
        const port = entry.detected?.port;
        switch (action) {
          case "start":
            if (regId) await startRegistered(regId);
            break;
          case "restart":
            if (regId) await restartRegistered(regId);
            break;
          case "stop":
            // Prefer the registered stop (knows the recipe); fall back to pid.
            if (regId) await stopRegistered(regId);
            else if (pid !== undefined) await stopProcess(pid);
            break;
          case "remove":
            if (regId) await deleteRegistered(regId);
            break;
          case "expose":
            if (port !== undefined) {
              await exposeServer(port);
              // Same-origin path URL (with a one-time token that the daemon turns
              // into a cookie) — opens over LAN http AND an https tunnel.
              const url = previewOpenUrl(port);
              if (previewWindow) previewWindow.location.replace(url);
              else window.open(url, "_blank", "noopener,noreferrer");
            } else if (previewWindow) {
              previewWindow.close();
            }
            break;
          case "unexpose":
            if (port !== undefined) await unexposeServer(port);
            break;
        }
        // Reflect reality immediately: rescan + refetch the registered list. The
        // rescan re-emits the servers WS frame so each row's `exposed` flag updates.
        await scanServers().catch(() => undefined);
        await refetchRegistered();
      } catch (err: unknown) {
        // Expose failed — don't leave a blank tab hanging.
        if (previewWindow) previewWindow.close();
        if (mountedRef.current) {
          setErrors((prev) => ({ ...prev, [entry.key]: actionErrorMessage(action, err) }));
        }
      } finally {
        if (mountedRef.current) setPendingKey(null);
      }
    },
    [pendingKey, refetchRegistered],
  );

  const handleRegistered = useCallback(
    (server: RegisteredServer): void => {
      setRegistered((prev) => [...prev.filter((r) => r.id !== server.id), server]);
      void refetchRegistered();
    },
    [refetchRegistered],
  );

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <EmptyState
          title="No dev servers listening"
          hint={
            <>
              Start one (e.g. <code style={{ color: "var(--color-cool)" }}>npm run dev</code>),
              or register a server to Start/Restart it from here.
            </>
          }
          action={
            <div className="flex flex-col items-center gap-3">
              <RegisterServerForm onRegistered={handleRegistered} />
              {hiddenCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="pill self-center"
                >
                  {showAll
                    ? "Hide background services"
                    : `Show ${hiddenCount} background service${hiddenCount === 1 ? "" : "s"}`}
                </button>
              ) : null}
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-1">
      {/* flex-wrap so the OPEN register form (w-full) drops to its own full-width
          row instead of being crammed into the right half on a phone. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="caption">
          {entries.length} {showAll ? "server" : "dev server"}
          {entries.length === 1 ? "" : "s"}
        </span>
        <RegisterServerForm onRegistered={handleRegistered} />
      </div>

      <div className="flex flex-col gap-2">
        {entries.map((entry) => (
          <ServerRow
            key={entry.key}
            entry={entry}
            pending={pendingKey === entry.key}
            error={errors[entry.key] ?? null}
            onAction={(action) => void runAction(entry, action)}
          />
        ))}
      </div>

      {/* Reveal/hide the OS background processes that merely hold a port. */}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="pill self-center"
        >
          {showAll
            ? "Hide background services"
            : `Show ${hiddenCount} background service${hiddenCount === 1 ? "" : "s"}`}
        </button>
      ) : null}
    </div>
  );
}

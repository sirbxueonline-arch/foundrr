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

/**
 * Build the remote-preview URL from the browser's current hostname (NEVER
 * "localhost"), so opening it from a phone reaches the dev box over LAN /
 * Tailscale rather than the phone itself.
 */
function previewUrl(proxyPort: number): string {
  return `${window.location.protocol}//${window.location.hostname}:${proxyPort}/`;
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

  const entries = mergeEntries(servers, registered);

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
      // mobile popup blockers don't suppress it after the await. Navigated once
      // the proxy port is known; closed if the expose call fails.
      const previewWindow =
        action === "expose" ? window.open("", "_blank", "noopener,noreferrer") : null;

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
              const { proxyPort } = await exposeServer(port);
              const url = previewUrl(proxyPort);
              if (previewWindow) previewWindow.location.replace(url);
              else window.open(url, "_blank", "noopener,noreferrer");
            }
            break;
          case "unexpose":
            if (port !== undefined) await unexposeServer(port);
            break;
        }
        // Reflect reality immediately: rescan + refetch the registered list. The
        // rescan re-emits the servers WS frame so exposedProxyPort updates.
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
          action={<RegisterServerForm onRegistered={handleRegistered} />}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-1">
      <div className="flex items-center justify-between gap-3">
        <span className="caption">
          {entries.length} server{entries.length === 1 ? "" : "s"}
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
    </div>
  );
}

/**
 * ServerRow — one dev server rendered as a telemetry row.
 *
 * A row represents a merged entry that may be:
 *   - detected only      → a live listening process we found (Open / Stop)
 *   - registered only    → a known launch recipe, not currently listening (Start)
 *   - detected+registered→ a registered server that is running right now
 *                          (Open / Restart / Stop; reconciled via registeredId)
 *
 * Boldness is spent on the port (mono, prominent) and the amber Pulse, which
 * only breathes when there is a live listening process. Everything else stays
 * quiet. The layout is fixed so per-row pending states never shift it.
 *
 * Remote-link gotcha: the "Open" link is built from `window.location.hostname`
 * (NEVER the literal "localhost"), so over Tailscale it targets the dev
 * machine rather than the phone viewing the dashboard.
 */
import type { DetectedServer, RegisteredServer } from "@mission-control/shared";
import { Pulse } from "./Pulse";
import { truncate } from "../lib/format";

export type ServerAction =
  | "open"
  | "stop"
  | "start"
  | "restart"
  | "remove"
  | "expose"
  | "unexpose";

export interface ServerEntry {
  /** Stable key: registered id when known, else `pid@port`. */
  key: string;
  detected?: DetectedServer;
  registered?: RegisteredServer;
}

interface ServerRowProps {
  entry: ServerEntry;
  /** True while an action on this row is in flight. */
  pending: boolean;
  /** Inline error from the most recent action on this row, if any. */
  error: string | null;
  /** Fires for the controls (open is handled via the anchor, not this). */
  onAction: (action: Exclude<ServerAction, "open">) => void;
}

const COMMAND_MAX_CHARS = 64;

/**
 * Build a URL from the browser's current hostname, NOT "localhost", so remote
 * (LAN / Tailscale) viewers reach the dev machine instead of their own phone.
 * Used for both the direct Open link and the Preview proxy link.
 */
function openUrl(port: number): string {
  return `${window.location.protocol}//${window.location.hostname}:${port}/`;
}

interface ControlButtonProps {
  label: string;
  color: string;
  disabled: boolean;
  onClick: () => void;
}

function ControlButton({ label, color, disabled, onClick }: ControlButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mono rounded-md px-2 py-1 text-[0.625rem] font-medium tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        color,
        borderColor: color,
        borderWidth: 1,
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {label}
    </button>
  );
}

export function ServerRow({ entry, pending, error, onAction }: ServerRowProps) {
  const { detected, registered } = entry;

  // A detected process is, by definition, currently listening → live (amber).
  const isLive = Boolean(detected);
  const port = detected?.port;
  const pid = detected?.pid ?? registered?.pid;
  const framework = detected?.framework;
  const command = detected?.command ?? registered?.command ?? "";
  const name = registered?.name;
  const ariaName = name ?? (port ? `port ${port}` : "server");
  // When set, a 0.0.0.0 reverse proxy is live for this server — preview is on.
  const proxyPort = detected?.exposedProxyPort;
  const isExposed = proxyPort !== undefined;

  return (
    <article className="panel flex flex-col gap-2 p-3" aria-label={`Server ${ariaName}`}>
      <div className="flex items-start justify-between gap-3">
        {/* Identity: pulse + port (prominent) + framework / registered name. */}
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="self-center">
            <Pulse active={isLive} label={isLive ? "Listening" : "Not running"} />
          </span>
          {port !== undefined ? (
            <span
              className="mono text-base font-semibold leading-none tabular-nums"
              style={{ color: "var(--color-text)" }}
            >
              :{port}
            </span>
          ) : (
            <span
              className="mono text-base font-semibold leading-none"
              style={{ color: "var(--color-muted)" }}
              title="Registered server — not currently listening"
            >
              {name ?? "—"}
            </span>
          )}
          {framework ? (
            <span className="text-xs" style={{ color: "var(--color-cool)" }}>
              {framework}
            </span>
          ) : null}
          {name && port !== undefined ? (
            <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
              {name}
            </span>
          ) : null}
        </div>

        {/* Controls. Fixed-size buttons; disabled (not hidden) while pending. */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {port !== undefined ? (
            <a
              href={openUrl(port)}
              target="_blank"
              rel="noreferrer noopener"
              className="mono rounded-md px-2 py-1 text-[0.625rem] font-medium tracking-wider transition-colors"
              style={{
                color: "var(--color-cool)",
                borderColor: "var(--color-cool)",
                borderWidth: 1,
                backgroundColor: "color-mix(in srgb, var(--color-cool) 10%, transparent)",
              }}
            >
              OPEN
            </a>
          ) : null}

          {/* Preview: the always-works path. Exposes a 0.0.0.0 reverse proxy to
              this (often localhost-only) dev server, then opens it on the
              dashboard host so a phone over LAN/Tailscale can reach it. */}
          {port !== undefined && !isExposed ? (
            <ControlButton
              label={pending ? "PREVIEW…" : "PREVIEW"}
              color="var(--color-signal)"
              disabled={pending}
              onClick={() => onAction("expose")}
            />
          ) : null}

          {port !== undefined && isExposed ? (
            <>
              <a
                href={openUrl(proxyPort)}
                target="_blank"
                rel="noreferrer noopener"
                className="mono rounded-md px-2 py-1 text-[0.625rem] font-medium tracking-wider transition-colors"
                style={{
                  color: "var(--color-signal)",
                  borderColor: "var(--color-signal)",
                  borderWidth: 1,
                  backgroundColor: "color-mix(in srgb, var(--color-signal) 10%, transparent)",
                }}
              >
                OPEN PREVIEW
              </a>
              <ControlButton
                label="STOP PREVIEW"
                color="var(--color-faint)"
                disabled={pending}
                onClick={() => onAction("unexpose")}
              />
            </>
          ) : null}

          {registered ? (
            <ControlButton
              label="START"
              color="var(--color-ok)"
              disabled={pending || isLive}
              onClick={() => onAction("start")}
            />
          ) : null}

          {registered && isLive ? (
            <ControlButton
              label="RESTART"
              color="var(--color-signal)"
              disabled={pending}
              onClick={() => onAction("restart")}
            />
          ) : null}

          {pid !== undefined ? (
            <ControlButton
              label="STOP"
              color="var(--color-alert)"
              disabled={pending}
              onClick={() => onAction("stop")}
            />
          ) : null}

          {registered ? (
            <ControlButton
              label="REMOVE"
              color="var(--color-faint)"
              disabled={pending}
              onClick={() => onAction("remove")}
            />
          ) : null}
        </div>
      </div>

      {/* Command (mono, truncated, full on hover) + pid (faint). */}
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="mono min-w-0 truncate text-xs leading-tight"
          style={{ color: "var(--color-muted)" }}
          title={command}
        >
          {command ? truncate(command, COMMAND_MAX_CHARS) : "—"}
        </span>
        <span
          className="mono shrink-0 text-[0.625rem] tabular-nums"
          style={{ color: "var(--color-faint)" }}
        >
          {pid !== undefined ? `pid ${pid}` : "stopped"}
        </span>
      </div>

      {/* Preview status: where it's reachable, or a hint that it always works. */}
      {port !== undefined && isExposed ? (
        <p className="mono text-[0.625rem] leading-tight" style={{ color: "var(--color-signal)" }}>
          Previewing → :{proxyPort}
        </p>
      ) : port !== undefined ? (
        <p
          className="text-[0.625rem] leading-tight"
          style={{ color: "var(--color-faint)" }}
          title="Preview opens a 0.0.0.0 reverse proxy, so it reaches the dev server even when it only listens on localhost."
        >
          Preview works even when this server is localhost-only.
        </p>
      ) : null}

      {/* Inline error — surfaced, never swallowed. */}
      {error ? (
        <p
          className="mono text-[0.625rem] leading-tight"
          role="alert"
          style={{ color: "var(--color-alert)" }}
        >
          {error}
        </p>
      ) : null}
    </article>
  );
}

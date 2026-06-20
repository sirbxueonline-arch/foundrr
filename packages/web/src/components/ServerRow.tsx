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
 * Remote-link gotcha: the direct "Open" link is built from
 * `window.location.hostname` (NEVER the literal "localhost"), so over Tailscale
 * it targets the dev machine rather than the phone viewing the dashboard. The
 * Preview link is same-origin (`/__preview/<port>/`), so it just inherits the
 * dashboard's own protocol+host.
 */
import type { DetectedServer, RegisteredServer } from "@mission-control/shared";
import { Pulse } from "./Pulse";
import { truncate } from "../lib/format";
import { isWebServer } from "../lib/serverKind";
import { previewUrl, previewOpenUrl } from "../lib/preview";

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
  const host = window.location.hostname;
  // For a loopback dashboard host, target "localhost" instead of the literal
  // IP: the browser then tries BOTH IPv6 (::1) and IPv4 (127.0.0.1), so a dev
  // server that binds ::1 only (Vite/Next default) is still reached — a literal
  // "127.0.0.1" would miss it (ECONNREFUSED). Remote / Tailscale hosts (a real
  // machine name) pass through unchanged so the link still targets the dev box.
  const isLoopback =
    host === "127.0.0.1" || host === "::1" || host === "[::1]" || host === "0.0.0.0";
  const target = isLoopback ? "localhost" : host;
  return `${window.location.protocol}//${target}:${port}/`;
}

/**
 * Ghost-pill control. The variant encodes the doc's button vocabulary:
 *   - "ghost"   neutral, hover lifts border to --cool (Restart, secondary)
 *   - "cool"    interactive affordance (Start)
 *   - "primary" amber-outlined, the one live/primary action (Preview)
 *   - "danger"  neutral until hover, then --alert (Stop, Remove, Stop Preview)
 */
type ControlVariant = "ghost" | "cool" | "primary" | "danger";

interface ControlButtonProps {
  label: string;
  variant: ControlVariant;
  disabled: boolean;
  onClick: () => void;
}

const VARIANT_CLASS: Record<ControlVariant, string> = {
  ghost: "pill",
  cool: "pill pill-cool",
  primary: "pill pill-primary",
  danger: "pill pill-danger",
};

function ControlButton({ label, variant, disabled, onClick }: ControlButtonProps) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={VARIANT_CLASS[variant]}>
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
  // When true, a path-mounted reverse proxy is live for this server — preview is
  // on, reachable at the same-origin `/__preview/<port>/` URL.
  const isExposed = Boolean(detected?.exposed);
  // Only offer browser affordances (Open / Preview) for things that actually
  // look like a web server — not background system services (ControlCenter,
  // Spotify, …) that merely hold a port. STOP is still allowed for anything.
  const webPreviewable = isWebServer(entry);
  const showOpen = port !== undefined && webPreviewable;

  return (
    <article className="panel flex flex-col gap-2 p-3" aria-label={`Server ${ariaName}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        {/* Identity: pulse + port (prominent) + framework / registered name. */}
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="self-center">
            <Pulse active={isLive} label={isLive ? "Listening" : "Not running"} />
          </span>
          {port !== undefined ? (
            // Port in mono --cool — semantic = interactive (it's a link to a
            // running server), per the doc.
            <span
              className="mono text-base font-medium leading-none tabular-nums"
              style={{ color: "var(--color-cool)" }}
            >
              :{port}
            </span>
          ) : (
            <span
              className="mono text-base font-medium leading-none"
              style={{ color: "var(--color-muted)" }}
              title="Registered server — not currently listening"
            >
              {name ?? "—"}
            </span>
          )}
          {/* Framework in light sans (not mono — it's a label, not an id). */}
          {framework ? (
            <span className="text-xs font-light" style={{ color: "var(--color-muted)" }}>
              {framework}
            </span>
          ) : null}
          {name && port !== undefined ? (
            <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
              {name}
            </span>
          ) : null}
        </div>

        {/* Controls. On mobile they sit on their own row (parent stacks) and
            wrap; on sm+ they align right beside the identity. Not shrink-0, so
            the identity block keeps its width instead of being squeezed out. */}
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {showOpen ? (
            <a
              href={openUrl(port as number)}
              target="_blank"
              rel="noreferrer noopener"
              className="pill pill-cool"
            >
              OPEN
            </a>
          ) : null}

          {/* Preview: the always-works path. Mounts a path-based reverse proxy
              to this (often localhost-only) dev server on the SAME origin as the
              dashboard, then opens `/__preview/<port>/` — so it reaches the dev
              server over the LAN AND through an https tunnel, no separate port,
              no mixed content. Only for things that look like a web server. */}
          {/* Preview is the primary action — the only amber-outlined control. */}
          {showOpen && !isExposed ? (
            <ControlButton
              label={pending ? "PREVIEW…" : "PREVIEW"}
              variant="primary"
              disabled={pending}
              onClick={() => onAction("expose")}
            />
          ) : null}

          {showOpen && isExposed ? (
            <>
              <a
                href={previewOpenUrl(port as number)}
                target="_blank"
                rel="noreferrer noopener"
                className="pill pill-primary"
              >
                OPEN PREVIEW
              </a>
              <ControlButton
                label="STOP PREVIEW"
                variant="danger"
                disabled={pending}
                onClick={() => onAction("unexpose")}
              />
            </>
          ) : null}

          {registered ? (
            <ControlButton
              label="START"
              variant="cool"
              disabled={pending || isLive}
              onClick={() => onAction("start")}
            />
          ) : null}

          {registered && isLive ? (
            <ControlButton
              label="RESTART"
              variant="ghost"
              disabled={pending}
              onClick={() => onAction("restart")}
            />
          ) : null}

          {pid !== undefined ? (
            <ControlButton
              label="STOP"
              variant="danger"
              disabled={pending}
              onClick={() => onAction("stop")}
            />
          ) : null}

          {registered ? (
            <ControlButton
              label="REMOVE"
              variant="danger"
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

      {/* Preview status: where it's reachable, or a hint that it always works.
          The hint only appears where Preview is actually offered (web servers),
          so non-web system services never advertise a preview they don't have. */}
      {isExposed ? (
        <p
          className="mono text-[0.625rem] leading-tight"
          style={{ color: "var(--color-signal-ink)" }}
        >
          {/* Surface the same-origin preview URL as copyable text. */}
          Previewing →{" "}
          <span className="select-all" style={{ color: "var(--color-text)" }}>
            {previewUrl(port as number)}
          </span>
        </p>
      ) : showOpen ? (
        <p
          className="text-[0.625rem] leading-tight"
          style={{ color: "var(--color-faint)" }}
          title="Preview mounts a reverse proxy on this dashboard's origin, so it reaches the dev server even when it only listens on localhost — over the LAN and through an https tunnel."
        >
          Preview works even when this server is localhost-only.
        </p>
      ) : detected ? (
        // Detected, but doesn't look like a web server — explain the missing
        // Open/Preview so its absence reads as intentional, not broken.
        <p
          className="text-[0.625rem] leading-tight"
          style={{ color: "var(--color-faint)" }}
          title="This looks like a background system service, not a web server. You can still stop it."
        >
          System service — no web preview.
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

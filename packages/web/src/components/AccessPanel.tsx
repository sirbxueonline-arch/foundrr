/**
 * AccessPanel — the away-surface enabler (M8).
 *
 * Renders as a drawer (mirrors GitPanel): a full-screen sheet on mobile, a
 * right-side panel on desktop, `role="dialog" aria-modal`, Esc to close. On open
 * it fetches `GET /api/access` and shows:
 *   - "Open on your phone" — a prominent QR for the best reachable URL, plus a
 *     small selector among other reachable addresses (each with its own QR).
 *   - An addresses list with copy-to-clipboard + an honest reachability hint.
 *   - A public-tunnel control (cloudflared) behind an inline danger warning,
 *     or an install/Tailscale nudge when cloudflared isn't present.
 *   - A short Tailscale tip.
 *
 * Errors use role="alert" and are surfaced, never swallowed. The tunnel start
 * flow polls `getAccess()` until the tunnel settles to `on` or `error`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ApiError,
  getAccess,
  getTelegramStatus,
  linkTelegram,
  startTunnel,
  stopTunnel,
  type AccessAddress,
  type AccessInfo,
  type TelegramLinkResult,
  type TelegramStatus,
} from "../lib/api";

interface AccessPanelProps {
  onClose: () => void;
}

/** What the panel is currently doing — drives spinners and disabled states. */
type LoadState = "loading" | "ready" | "error";

/** How often we re-poll `getAccess()` while the tunnel is starting. */
const TUNNEL_POLL_MS = 1500;

function loadErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return `Failed to load access info (${err.status})`;
  if (err instanceof Error) return err.message;
  return "Failed to load access info";
}

function tunnelErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return `Tunnel request failed (${err.status})`;
  if (err instanceof Error) return err.message;
  return "Tunnel request failed";
}

/**
 * Choose the URL to feature in the primary QR:
 *   tunnel-on → tunnel url; else first tailscale; else first reachable lan;
 *   else the local url; else the first address; else null.
 */
function pickPrimary(info: AccessInfo): { url: string; caption: string } | null {
  if (info.tunnel.state === "on" && info.tunnel.url) {
    return { url: info.tunnel.url, caption: "Public tunnel — works from anywhere" };
  }
  const tailscale = info.addresses.find((a) => a.scope === "tailscale");
  if (tailscale) return { url: tailscale.url, caption: `${tailscale.label} — works from anywhere` };

  const lan = info.addresses.find((a) => a.scope === "lan" && a.reachable);
  if (lan) return { url: lan.url, caption: `${lan.label} — same Wi-Fi` };

  const local = info.addresses.find((a) => a.scope === "local");
  if (local) return { url: local.url, caption: `${local.label} — this machine only` };

  const first = info.addresses[0];
  return first ? { url: first.url, caption: first.label } : null;
}

export function AccessPanel({ onClose }: AccessPanelProps) {
  const [load, setLoad] = useState<LoadState>("loading");
  const [info, setInfo] = useState<AccessInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Which reachable address the primary QR is showing (by url). null = default.
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  const refetch = useCallback(async (): Promise<AccessInfo | null> => {
    try {
      const next = await getAccess();
      if (!mountedRef.current) return null;
      setInfo(next);
      setLoad("ready");
      setLoadError(null);
      return next;
    } catch (err: unknown) {
      if (!mountedRef.current) return null;
      setLoad("error");
      setLoadError(loadErrorMessage(err));
      return null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refetch();
    return () => {
      mountedRef.current = false;
    };
  }, [refetch]);

  // Close on Escape — a basic modal affordance (mirrors GitPanel).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Poll until the tunnel settles to `on`/`error`/`off`, then stop. */
  const pollUntilSettled = useCallback(async (): Promise<void> => {
    // A bounded loop so a stuck "starting" never polls forever.
    for (let i = 0; i < 40; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, TUNNEL_POLL_MS));
      if (!mountedRef.current) return;
      const next = await refetch();
      if (!next || next.tunnel.state !== "starting") return;
    }
  }, [refetch]);

  const handleStartTunnel = useCallback(async (): Promise<void> => {
    if (tunnelBusy) return;
    setTunnelBusy(true);
    setTunnelError(null);
    try {
      const result = await startTunnel();
      if (!mountedRef.current) return;
      if (result.state === "error") {
        setTunnelError(result.error ?? "Tunnel failed to start");
        await refetch();
        return;
      }
      await refetch();
      await pollUntilSettled();
    } catch (err: unknown) {
      if (mountedRef.current) setTunnelError(tunnelErrorMessage(err));
    } finally {
      if (mountedRef.current) setTunnelBusy(false);
    }
  }, [tunnelBusy, refetch, pollUntilSettled]);

  const handleStopTunnel = useCallback(async (): Promise<void> => {
    if (tunnelBusy) return;
    setTunnelBusy(true);
    setTunnelError(null);
    try {
      await stopTunnel();
      if (!mountedRef.current) return;
      await refetch();
    } catch (err: unknown) {
      if (mountedRef.current) setTunnelError(tunnelErrorMessage(err));
    } finally {
      if (mountedRef.current) setTunnelBusy(false);
    }
  }, [tunnelBusy, refetch]);

  // The address the primary QR shows: the user's pick (if still reachable) or
  // the computed default.
  const reachableAddresses = useMemo(
    () => (info ? info.addresses.filter((a) => a.reachable) : []),
    [info],
  );

  const primary = info ? pickPrimary(info) : null;
  const selected = useMemo(() => {
    if (!info) return null;
    if (selectedUrl) {
      const match = info.addresses.find((a) => a.url === selectedUrl);
      if (match) return { url: match.url, caption: `${match.label} — ${scopeHint(match.scope)}` };
    }
    return primary;
  }, [info, selectedUrl, primary]);

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Access from anywhere"
    >
      {/* Backdrop — click to dismiss. */}
      <button
        type="button"
        aria-label="Close access panel"
        onClick={onClose}
        className="absolute inset-0 h-full w-full"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-text) 35%, transparent)" }}
      />

      {/* Sheet: full-screen on mobile, right-side panel on desktop. */}
      <section
        className="panel relative ml-auto flex h-full w-full flex-col sm:max-w-xl"
        style={{ borderRadius: 0 }}
      >
        <PanelHeader onClose={onClose} />

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {load === "loading" ? (
            <p className="mono text-xs" role="status" style={{ color: "var(--color-faint)" }}>
              Loading access info…
            </p>
          ) : null}

          {load === "error" ? (
            <p
              className="mono text-xs leading-relaxed"
              role="alert"
              style={{ color: "var(--color-alert)" }}
            >
              {loadError ?? "Failed to load access info."}
            </p>
          ) : null}

          {load === "ready" && info ? (
            <div className="flex flex-col gap-5">
              <PhoneSection
                selected={selected}
                reachable={reachableAddresses}
                selectedUrl={selectedUrl ?? selected?.url ?? null}
                onSelectUrl={setSelectedUrl}
              />

              <AddressesSection addresses={info.addresses} />

              <TunnelSection
                tunnel={info.tunnel}
                busy={tunnelBusy}
                error={tunnelError}
                onStart={() => void handleStartTunnel()}
                onStop={() => void handleStopTunnel()}
              />

              <TelegramSection />

              <TailscaleTip />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

// ─── Telegram leash — one-tap link ────────────────────────────────────────────

const TELEGRAM_POLL_MS = 3000;

/**
 * One-tap Telegram linking, right in the dashboard. "Link Telegram" turns the
 * leash on (shared mode) and fetches a single-use code; the user opens the bot
 * (deep link) and sends the copied `/link <code>`. We poll status so the panel
 * flips to "linked" automatically the moment the bind lands — no CLI, no refresh.
 */
function TelegramSection() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [link, setLink] = useState<TelegramLinkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async (): Promise<void> => {
      const s = await getTelegramStatus();
      if (!cancelled) setStatus(s);
    };
    void tick();
    const timer = setInterval(() => void tick(), TELEGRAM_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const linked = status?.linked === true;
  const command = link?.linkCode ? `/link ${link.linkCode}` : "";

  const onLink = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await linkTelegram();
      if (!result.ok) setError(result.error ?? "Could not start linking. Try again.");
      else setLink(result);
    } catch (e) {
      setError(e instanceof ApiError ? `Link failed (${e.status})` : "Link failed.");
    } finally {
      setBusy(false);
    }
  };

  const copyCommand = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — the code is still visible to type by hand.
    }
  };

  return (
    <section aria-label="Telegram approvals">
      <SectionTitle>Telegram approvals</SectionTitle>
      <p className="mono mt-2 text-xs leading-relaxed" style={{ color: "var(--color-faint)" }}>
        Approve Claude&apos;s permission prompts from your phone — one tap, from anywhere.
      </p>

      {linked ? (
        <div
          className="mono mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
          style={{
            color: "var(--color-ok)",
            border: "1px solid color-mix(in srgb, var(--color-ok) 45%, transparent)",
          }}
        >
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "var(--color-ok)" }}
          />
          <span>Telegram linked — approvals reach your phone</span>
        </div>
      ) : link?.mode === "shared" && link.linkCode ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm font-light leading-relaxed" style={{ color: "var(--color-text)" }}>
            Open{" "}
            <span className="mono font-medium" style={{ color: "var(--color-cool)" }}>
              @{link.botUsername}
            </span>{" "}
            and send this code:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code
              className="mono select-all rounded-md px-2.5 py-2 text-sm"
              style={{
                backgroundColor: "var(--color-inset)",
                color: "var(--color-text)",
                border: "1px solid var(--color-line)",
              }}
            >
              {command}
            </code>
            <button type="button" onClick={() => void copyCommand()} className="pill pill-cool">
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <a
              href={`https://t.me/${link.botUsername}`}
              target="_blank"
              rel="noreferrer noopener"
              className="pill pill-primary"
            >
              Open Telegram
            </a>
          </div>
          <p
            className="mono text-[0.6875rem] leading-relaxed"
            style={{ color: "var(--color-signal-ink)" }}
          >
            Waiting for you to send the code… this updates automatically.
          </p>
        </div>
      ) : link?.mode === "own" ? (
        <p className="mt-3 text-sm font-light leading-relaxed" style={{ color: "var(--color-text)" }}>
          You&apos;re on your own bot — message it{" "}
          <code className="mono" style={{ color: "var(--color-cool)" }}>
            /link &lt;access token&gt;
          </code>
          ; your token is in this page&apos;s URL after <code className="mono">?token=</code>.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void onLink()}
          disabled={busy}
          className="pill pill-primary mt-3"
        >
          {busy ? "Linking…" : "Link Telegram"}
        </button>
      )}

      {error ? (
        <p
          className="mono mt-2 text-xs leading-relaxed"
          role="alert"
          style={{ color: "var(--color-alert)" }}
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function PanelHeader({ onClose }: { onClose: () => void }) {
  return (
    <header className="flex items-start justify-between gap-3 border-b p-3 hairline">
      <div className="min-w-0">
        <h2 className="text-base font-light tracking-tight" style={{ color: "var(--color-text)" }}>
          Access from anywhere
        </h2>
        <p className="caption mt-1">reach this dashboard from your phone</p>
      </div>

      <button type="button" onClick={onClose} aria-label="Close" className="pill shrink-0">
        CLOSE
      </button>
    </header>
  );
}

// ─── "Open on your phone" — the prominent QR ──────────────────────────────────

interface PhoneSectionProps {
  selected: { url: string; caption: string } | null;
  reachable: AccessAddress[];
  selectedUrl: string | null;
  onSelectUrl: (url: string | null) => void;
}

function PhoneSection({ selected, reachable, selectedUrl, onSelectUrl }: PhoneSectionProps) {
  if (!selected) {
    return (
      <section aria-label="Open on your phone">
        <SectionTitle>Open on your phone</SectionTitle>
        <p className="mono mt-2 text-xs leading-relaxed" style={{ color: "var(--color-faint)" }}>
          No reachable address yet.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Open on your phone">
      <SectionTitle>Open on your phone</SectionTitle>

      <div className="mt-3 flex flex-col items-center gap-3">
        {/* White QR tile with a hairline so it reads as a distinct tile on the
            light card (and still scans cleanly). */}
        <div
          className="rounded-lg bg-white p-3"
          style={{ border: "1px solid var(--color-line)" }}
        >
          <QRCodeSVG value={selected.url} size={180} level="M" includeMargin={false} />
        </div>
        <p className="mono text-center text-[0.625rem] leading-tight" style={{ color: "var(--color-cool)" }}>
          {selected.caption}
        </p>
      </div>

      {/* Selector among reachable addresses (only when there's a choice). */}
      {reachable.length > 1 ? (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5" role="group" aria-label="Choose address for QR">
          {reachable.map((addr) => {
            const active = (selectedUrl ?? selected.url) === addr.url;
            return (
              <button
                key={addr.url}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectUrl(addr.url)}
                className="mono rounded-md px-2 py-1 text-[0.625rem] tracking-wider transition-colors"
                style={{
                  color: active ? "var(--color-text)" : "var(--color-muted)",
                  backgroundColor: active ? "var(--color-void)" : "transparent",
                  border: `1px solid ${active ? "var(--color-cool)" : "var(--color-line)"}`,
                }}
              >
                {addr.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

// ─── Addresses list ──────────────────────────────────────────────────────────

function AddressesSection({ addresses }: { addresses: AccessAddress[] }) {
  return (
    <section aria-label="Addresses">
      <SectionTitle>Addresses</SectionTitle>
      <ul className="mt-2 flex flex-col gap-2">
        {addresses.map((addr) => (
          <li key={addr.url}>
            <AddressRow addr={addr} />
          </li>
        ))}
        {addresses.length === 0 ? (
          <li className="mono text-xs" style={{ color: "var(--color-faint)" }}>
            No addresses reported.
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function scopeHint(scope: AccessAddress["scope"]): string {
  if (scope === "tailscale") return "works from anywhere";
  if (scope === "lan") return "same Wi-Fi";
  return "this machine only";
}

function AddressRow({ addr }: { addr: AccessAddress }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copyError, setCopyError] = useState(false);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const onCopy = useCallback(async (): Promise<void> => {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(addr.url);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (insecure context / permissions). Surface it.
      setCopyError(true);
    }
  }, [addr.url]);

  const isTailscale = addr.scope === "tailscale";

  return (
    <div
      className="rounded-md p-2"
      style={{ backgroundColor: "var(--color-void)", border: "1px solid var(--color-line)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="mono text-xs font-medium" style={{ color: "var(--color-text)" }}>
            {addr.label}
          </span>
          {isTailscale ? (
            <span
              className="mono rounded px-1 py-0.5 text-[0.5625rem] tracking-wider"
              style={{
                color: "var(--color-ok)",
                border: "1px solid var(--color-ok)",
                backgroundColor: "color-mix(in srgb, var(--color-ok) 12%, transparent)",
              }}
            >
              FROM ANYWHERE
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void onCopy()}
          className="mono shrink-0 rounded-md px-2 py-1 text-[0.625rem] tracking-wider transition-colors"
          style={{
            color: copied ? "var(--color-ok)" : "var(--color-cool)",
            border: `1px solid ${copied ? "var(--color-ok)" : "var(--color-line)"}`,
          }}
          aria-label={`Copy ${addr.label} URL`}
        >
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>

      <p
        className="mono mt-1 truncate text-[0.625rem]"
        style={{ color: "var(--color-muted)" }}
        title={addr.url}
      >
        {addr.url}
      </p>

      {copyError ? (
        <p className="mono mt-1 text-[0.5625rem]" role="alert" style={{ color: "var(--color-alert)" }}>
          Couldn’t copy — long-press the URL above instead.
        </p>
      ) : null}

      {!addr.reachable ? (
        <p className="mono mt-1 text-[0.5625rem] leading-tight" style={{ color: "var(--color-signal-ink)" }}>
          listed but needs <code style={{ color: "var(--color-text)" }}>HOST=0.0.0.0 mc start</code> to reach
          from other devices
        </p>
      ) : null}
    </div>
  );
}

// ─── Public tunnel control ────────────────────────────────────────────────────

interface TunnelSectionProps {
  tunnel: AccessInfo["tunnel"];
  busy: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
}

function TunnelSection({ tunnel, busy, error, onStart, onStop }: TunnelSectionProps) {
  return (
    <section aria-label="Public tunnel">
      <SectionTitle>Public tunnel</SectionTitle>

      {!tunnel.installed ? (
        <p className="mono mt-2 text-xs leading-relaxed" style={{ color: "var(--color-faint)" }}>
          Install cloudflared (
          <code style={{ color: "var(--color-cool)" }}>{tunnel.installCmd ?? "brew install cloudflared"}</code>
          ) for a public URL, or use Tailscale (recommended).
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {tunnel.state !== "on" ? (
            <p
              className="mono rounded-md p-2 text-[0.625rem] leading-tight"
              style={{
                color: "var(--color-alert)",
                border: "1px solid var(--color-alert)",
                backgroundColor: "color-mix(in srgb, var(--color-alert) 12%, transparent)",
              }}
            >
              Exposes a shell to the internet — anyone with the URL + token can run commands.
            </p>
          ) : null}

          {tunnel.state === "on" && tunnel.url ? (
            <div className="flex flex-col items-center gap-2">
              <div
                className="rounded-lg bg-white p-3"
                style={{ border: "1px solid var(--color-line)" }}
              >
                <QRCodeSVG value={tunnel.url} size={160} level="M" includeMargin={false} />
              </div>
              <p
                className="mono w-full truncate text-center text-[0.625rem]"
                style={{ color: "var(--color-cool)" }}
                title={tunnel.url}
              >
                {tunnel.url}
              </p>
              <button type="button" onClick={onStop} disabled={busy} className="pill pill-danger">
                {busy ? "STOPPING…" : "STOP PUBLIC TUNNEL"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onStart}
              disabled={busy || tunnel.state === "starting"}
              className="pill pill-primary self-start"
            >
              {tunnel.state === "starting" || busy ? "STARTING…" : "START PUBLIC TUNNEL"}
            </button>
          )}
        </div>
      )}

      {tunnel.state === "error" && tunnel.error ? (
        <p className="mono mt-2 text-[0.625rem] leading-tight" role="alert" style={{ color: "var(--color-alert)" }}>
          {tunnel.error}
        </p>
      ) : null}

      {error ? (
        <p className="mono mt-2 text-[0.625rem] leading-tight" role="alert" style={{ color: "var(--color-alert)" }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}

// ─── Tailscale tip ────────────────────────────────────────────────────────────

function TailscaleTip() {
  return (
    <p
      className="mono rounded-md p-2 text-[0.625rem] leading-relaxed"
      style={{
        color: "var(--color-muted)",
        backgroundColor: "var(--color-void)",
        border: "1px solid var(--color-line)",
      }}
    >
      <span style={{ color: "var(--color-cool)" }}>Tip:</span> Tailscale gives private from-anywhere access
      over cellular — no public URL.
    </p>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="caption">{children}</h3>;
}

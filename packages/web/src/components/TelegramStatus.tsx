/**
 * TelegramStatus — a quiet indicator for the away-surface link state.
 *
 * Fetched once on mount via `getTelegramStatus()`. It is intentionally
 * defensive: the `/api/telegram/status` endpoint may not exist yet, so a 404
 * or any failure resolves to `null` and we render nothing — never a crash.
 *
 * States:
 *  - linked              → a quiet "📱 linked" pill (the phone is bound).
 *  - hasToken, !linked   → "Telegram: not linked — message your bot /link <token>".
 *  - no token / null     → faint "Telegram: run `mc telegram setup`" hint, or
 *                          nothing while still loading / on unknown status.
 *
 * Kept subtle by design — this lives in the header corner, not center stage.
 */
import { useEffect, useState } from "react";
import { getTelegramStatus, type TelegramStatus as TelegramStatusData } from "../lib/api";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; status: TelegramStatusData | null };

export function TelegramStatus() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    // getTelegramStatus never rejects (it resolves null on any failure), but
    // guard anyway so an unexpected throw can't take down the header.
    getTelegramStatus()
      .then((status) => {
        if (!cancelled) setState({ kind: "ready", status });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "ready", status: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Loading or unknown status → render nothing (no flicker, no layout shift).
  if (state.kind === "loading" || state.status === null) return null;

  const { linked, hasToken } = state.status;

  if (linked) {
    return (
      <span
        className="mono inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.625rem] tracking-wider"
        style={{
          color: "var(--color-ok)",
          borderColor: "var(--color-ok)",
          borderWidth: 1,
          backgroundColor: "color-mix(in srgb, var(--color-ok) 12%, transparent)",
        }}
        title="A Telegram chat is linked to this daemon"
      >
        <span aria-hidden="true">📱</span>
        <span>linked</span>
      </span>
    );
  }

  if (hasToken) {
    return (
      <span
        className="mono text-[0.625rem] tracking-wide"
        style={{ color: "var(--color-muted)" }}
      >
        Telegram: not linked — message your bot{" "}
        <code style={{ color: "var(--color-cool)" }}>/link &lt;token&gt;</code>
      </span>
    );
  }

  // No bot token configured.
  return (
    <span
      className="mono text-[0.625rem] tracking-wide"
      style={{ color: "var(--color-faint)" }}
    >
      Telegram: run <code style={{ color: "var(--color-muted)" }}>mc telegram setup</code>
    </span>
  );
}

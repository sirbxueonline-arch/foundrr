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
        className="mono inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.625rem] tracking-wider"
        style={{
          color: "var(--color-ok)",
          borderColor: "color-mix(in srgb, var(--color-ok) 45%, transparent)",
          borderWidth: 1,
        }}
        title="A Telegram chat is linked to this daemon — approve prompts from your phone"
      >
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: "var(--color-ok)" }}
        />
        <span>Telegram</span>
      </span>
    );
  }

  if (hasToken) {
    // Bot configured but no phone bound yet — a terse, calm "not linked" chip;
    // the full /link instructions live in the Connect panel, not the header.
    return (
      <span
        className="mono inline-flex items-center gap-1.5 text-[0.625rem] tracking-wider"
        style={{ color: "var(--color-faint)" }}
        title="Telegram bot configured, but no phone is linked yet. Open Connect to link one."
      >
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: "var(--color-faint)" }}
        />
        <span>Telegram · not linked</span>
      </span>
    );
  }

  // No bot token configured — keep the header clean rather than advertising a
  // CLI command here; setup is surfaced in the Connect panel.
  return null;
}

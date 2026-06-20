/**
 * ModelPicker — a compact "pick your AI model" control that lives in the Header.
 * The chosen model tags telemetry and the global leaderboard bucket, AND drives
 * which agent the Foundrr terminal launches — so it is the user's identity on
 * the board and the terminal's launch target.
 *
 * Controlled by App: it receives the selected `model` key (lifted so the Header
 * picker and the terminal launch button stay in lockstep), the launchable
 * `agents` with install state (for a subtle "· not installed" hint), and an
 * `onModelChange` callback. Choosing a model optimistically calls back, then
 * POSTs to /api/config/model; on failure it reverts and shows an inline error.
 *
 * A real native <select> is used deliberately — it is the most robust,
 * keyboard-accessible, and mobile-friendly option, styled to the Aqua light
 * surface (mono, hairline border, amber accent dot).
 */
import { useState } from "react";

import { MODELS, modelByKey } from "@mission-control/shared";

import { ApiError, setModelApi, type LaunchableAgent } from "../lib/api";
import { logoForKey } from "./BrandLogos";

interface ModelPickerProps {
  /** The selected model key; null until loaded by the parent. */
  model: string | null;
  /** Launchable agents + install state; null if unknown (hints skipped). */
  agents: LaunchableAgent[] | null;
  /** Called with the new key when the user picks a model. */
  onModelChange: (model: string) => void;
}

/** What the active model should show; falls back to the raw key if unknown. */
function labelFor(key: string | null): string {
  if (!key) return "…";
  return modelByKey(key)?.name ?? key;
}

/**
 * The option label, with a subtle "· not installed" suffix when we know the
 * agent's CLI is missing. Unknown install state (no /api/agents, or an
 * IDE-based model not in the list) shows the plain name.
 */
function optionLabel(key: string, name: string, agents: LaunchableAgent[] | null): string {
  if (!agents) return name;
  const agent = agents.find((a) => a.key === key);
  if (agent && !agent.installed) return `${name} · not installed`;
  return name;
}

export function ModelPicker({ model, agents, onModelChange }: ModelPickerProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSelect = async (next: string): Promise<void> => {
    // Serialize: ignore a new pick while a save is in flight so overlapping
    // requests can't revert to a stale `previous` on failure.
    if (pending) return;
    const previous = model;
    if (next === previous) return;
    // Optimistic: reflect the choice immediately via the parent, then persist.
    onModelChange(next);
    setPending(true);
    setError(null);
    try {
      await setModelApi(next);
    } catch (err: unknown) {
      // Revert to last-known-good and surface a short inline message.
      if (previous) onModelChange(previous);
      const message =
        err instanceof ApiError && err.status === 400
          ? "invalid model"
          : "couldn't save";
      setError(message);
    } finally {
      setPending(false);
    }
  };

  const disabled = model === null || pending;
  // Show the selected model's official brand mark inside the control.
  const SelectedLogo = model ? logoForKey(model) : null;

  return (
    <div className="flex min-w-0 items-center gap-1.5 lg:w-full">
      <div className="relative inline-flex items-center lg:w-full">
        {/* The selected model's brand logo (a neutral dot until it loads). */}
        {SelectedLogo ? (
          <span
            className="pointer-events-none absolute left-2 flex items-center"
            style={{ color: "var(--color-text)" }}
            aria-hidden="true"
          >
            <SelectedLogo size={15} />
          </span>
        ) : (
          <span
            className="pointer-events-none absolute left-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: "var(--color-faint)" }}
            aria-hidden="true"
          />
        )}
        <select
          aria-label="AI model"
          title={`AI: ${labelFor(model)}`}
          value={model ?? ""}
          disabled={disabled}
          onChange={(e) => void onSelect(e.target.value)}
          onFocus={() => setError(null)}
          // h-10 (40px) touch target on mobile, compact 30px on desktop. The
          // max-w cap stops a native <select> from sizing to its WIDEST option
          // ("…· not installed") and ballooning the header; it truncates instead.
          className="mono h-10 min-w-0 max-w-[9.5rem] cursor-pointer appearance-none rounded-md pl-7 pr-6 text-[0.6875rem] tracking-wider transition-colors lg:h-[1.875rem] lg:w-full lg:max-w-none disabled:cursor-default disabled:opacity-60"
          style={{
            color: "var(--color-text)",
            backgroundColor: "color-mix(in srgb, var(--color-line) 35%, transparent)",
            border: "1px solid var(--color-line)",
          }}
        >
          {model === null ? <option value="">AI…</option> : null}
          {MODELS.map((m) => (
            <option key={m.key} value={m.key}>
              {optionLabel(m.key, m.name, agents)}
            </option>
          ))}
        </select>
        {/* Chevron — purely decorative since we removed the native arrow. */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="pointer-events-none absolute right-2"
          style={{ color: "var(--color-faint)" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Inline error — terse, only when a save fails. */}
      {error ? (
        <span
          className="mono text-[0.625rem]"
          style={{ color: "var(--color-alert)" }}
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}

/**
 * EmptyState — a reusable honest empty surface: a title, a hint explaining the
 * situation, and an optional next action. Never fakes content.
 */
import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  hint: ReactNode;
  /** Optional next-action affordance (e.g. a button or formatted command). */
  action?: ReactNode;
}

export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      {/* A calm, static dot — the same vocabulary as the live Pulse, but quiet.
          Signals "nothing here yet" without faking activity. */}
      <span
        className="mb-1 inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: "var(--color-faint)" }}
        aria-hidden="true"
      />
      <h2
        className="text-sm font-medium tracking-wide"
        style={{ color: "var(--color-muted)" }}
      >
        {title}
      </h2>
      <p className="max-w-sm text-sm leading-relaxed" style={{ color: "var(--color-faint)" }}>
        {hint}
      </p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

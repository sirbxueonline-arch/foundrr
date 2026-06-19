/**
 * ApprovalBanner — the product's reason to exist: a remote permission gate that
 * MUST be impossible to miss.
 *
 * When Claude Code is blocked on a `PreToolUse` approval, the request arrives
 * live over the WS stream and lands in `useStream().approvals`. This banner
 * renders the *pending* ones (state === "pending") as a sticky bar pinned to
 * the top of the viewport, above all other content on both desktop and mobile.
 *
 * Why it's unmissable:
 *  - `position: sticky; top: 0; z-index` over everything → it overlays the app
 *    shell and never scrolls away.
 *  - `--signal` amber accent with the breathing pulse (the one place the UI
 *    spends boldness); reduced-motion users get a steady glow, no movement.
 *  - `role="alertdialog"` + `aria-live="assertive"` → screen readers announce
 *    it immediately and treat it as a decision the user must engage with.
 *
 * Decisions call `decideApproval(id, ...)`. Both buttons disable while in
 * flight; on success we optimistically drop the row (the `approval_resolved`
 * WS frame removes it from `pending` too, so the two converge). Errors render
 * inline with `role="alert"` and are never swallowed.
 *
 * When nothing is pending the component renders `null` — no empty bar, no
 * layout shift.
 */
import { useState } from "react";
import type { ApprovalRequest } from "@mission-control/shared";
import { decideApproval, ApiError } from "../lib/api";

interface ApprovalBannerProps {
  approvals: ApprovalRequest[];
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Decision failed";
}

export function ApprovalBanner({ approvals }: ApprovalBannerProps) {
  // Track ids we've optimistically resolved so the row drops instantly on a
  // successful decision, before the `approval_resolved` WS frame catches up.
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const pending = approvals
    .filter((a) => a.state === "pending" && !resolvedIds.has(a.id))
    // Newest first so the most urgent gate sits at the top of the stack.
    .sort((a, b) => b.createdAt - a.createdAt);

  if (pending.length === 0) return null;

  const markResolved = (id: string): void => {
    setResolvedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-label={`${pending.length} approval${pending.length === 1 ? "" : "s"} awaiting your decision`}
      aria-live="assertive"
      className="sticky top-0 z-50 w-full border-b"
      style={{
        backgroundColor: "var(--color-panel)",
        borderColor: "var(--color-signal)",
        // A second hairline of amber along the very top edge — reads as a
        // warning strip even at a glance.
        boxShadow: "inset 0 3px 0 0 var(--color-signal)",
      }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <span
            className="pulse-dot inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: "var(--color-signal)" }}
            aria-hidden="true"
          />
          <span
            className="mono text-[0.625rem] font-semibold uppercase tracking-[0.16em]"
            style={{ color: "var(--color-signal)" }}
          >
            {pending.length === 1
              ? "Approval required"
              : `${pending.length} approvals required`}
          </span>
        </div>

        <ul className="flex flex-col gap-2">
          {pending.map((a) => (
            <ApprovalRow key={a.id} approval={a} onResolved={markResolved} />
          ))}
        </ul>
      </div>
    </div>
  );
}

interface ApprovalRowProps {
  approval: ApprovalRequest;
  onResolved: (id: string) => void;
}

function ApprovalRow({ approval, onResolved }: ApprovalRowProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: "allow" | "deny"): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await decideApproval(approval.id, decision);
      // Optimistic: drop the row now; the WS `approval_resolved` confirms it.
      onResolved(approval.id);
    } catch (err: unknown) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <li
      className="panel flex flex-col gap-2 p-2.5"
      style={{ backgroundColor: "var(--color-void)" }}
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            className="mono text-sm font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            {approval.project}
          </span>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            wants to run
          </span>
          <span
            className="mono text-xs font-medium"
            style={{ color: "var(--color-cool)" }}
          >
            {approval.toolName}
          </span>
        </div>

        <p className="text-sm leading-snug" style={{ color: "var(--color-text)" }}>
          {approval.summary}
        </p>

        {approval.detail ? (
          <code
            // Truncated to one line; full text on hover (title) and on tap the
            // browser shows it — never hide the command being approved.
            title={approval.detail}
            tabIndex={0}
            className="mono block max-w-full truncate rounded px-2 py-1 text-xs"
            style={{
              color: "var(--color-muted)",
              backgroundColor: "var(--color-panel)",
              border: "1px solid var(--color-line)",
            }}
          >
            {approval.detail}
          </code>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="text-xs"
          style={{ color: "var(--color-alert)" }}
        >
          {error} — try again.
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void decide("allow")}
          disabled={submitting}
          className="mono flex-1 rounded-md px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-opacity disabled:opacity-50"
          style={{
            color: "var(--color-ok)",
            borderColor: "var(--color-ok)",
            borderWidth: 1,
            backgroundColor: "color-mix(in srgb, var(--color-ok) 14%, transparent)",
          }}
        >
          {submitting ? "…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => void decide("deny")}
          disabled={submitting}
          className="mono flex-1 rounded-md px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-opacity disabled:opacity-50"
          style={{
            color: "var(--color-alert)",
            borderColor: "var(--color-alert)",
            borderWidth: 1,
            backgroundColor: "color-mix(in srgb, var(--color-alert) 14%, transparent)",
          }}
        >
          {submitting ? "…" : "Deny"}
        </button>
      </div>
    </li>
  );
}

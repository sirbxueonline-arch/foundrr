/**
 * GitFileRow — one changed file in the GitPanel list.
 *
 * Layout: a status-code chip (colored by change kind) + the mono path, a
 * per-file Revert affordance, and a lazily-loaded <DiffView> that only fetches
 * when the row is expanded. The diff is fetched once and cached for the row's
 * lifetime (re-expanding doesn't refetch); the parent remounts rows after a
 * mutation, which naturally invalidates the cache.
 *
 * The per-file Revert is destructive, so it is gated behind an explicit
 * two-step confirm owned by the parent (`confirming` / onRequest/Cancel/Confirm).
 */
import { useEffect, useRef, useState } from "react";
import type { GitFileChange } from "@mission-control/shared";
import { ApiError, getGitDiff } from "../lib/api";
import { DiffView } from "./DiffView";

interface GitFileRowProps {
  file: GitFileChange;
  cwd: string;
  expanded: boolean;
  onToggle: () => void;
  confirming: boolean;
  discarding: boolean;
  onRequestDiscard: () => void;
  onCancelDiscard: () => void;
  onConfirmDiscard: () => void;
  discardError: string | null;
}

type DiffState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; diff: string; truncated: boolean }
  | { phase: "error"; message: string };

/**
 * Map a porcelain status code to a label + palette color.
 *   A / ?? → added (ok)        D → deleted (alert)
 *   M      → modified (signal) R → renamed (cool)   else → muted
 */
function chipStyle(status: string): { label: string; color: string } {
  const head = status.trim().charAt(0).toUpperCase();
  switch (head) {
    case "A":
    case "?":
      return { label: status === "??" ? "??" : status, color: "var(--color-ok)" };
    case "D":
      return { label: status, color: "var(--color-alert)" };
    case "M":
      return { label: status, color: "var(--color-signal)" };
    case "R":
      return { label: status, color: "var(--color-cool)" };
    default:
      return { label: status || "?", color: "var(--color-muted)" };
  }
}

function diffErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return `Failed to load diff (${err.status})`;
  if (err instanceof Error) return err.message;
  return "Failed to load diff";
}

export function GitFileRow({
  file,
  cwd,
  expanded,
  onToggle,
  confirming,
  discarding,
  onRequestDiscard,
  onCancelDiscard,
  onConfirmDiscard,
  discardError,
}: GitFileRowProps) {
  const [diff, setDiff] = useState<DiffState>({ phase: "idle" });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Lazily fetch the diff the first time the row is expanded.
  useEffect(() => {
    if (!expanded || diff.phase !== "idle") return;
    let cancelled = false;
    setDiff({ phase: "loading" });
    void (async () => {
      try {
        const result = await getGitDiff(cwd, { file: file.path, staged: file.staged });
        if (cancelled || !mountedRef.current) return;
        setDiff({ phase: "ready", diff: result.diff, truncated: result.truncated });
      } catch (err: unknown) {
        if (cancelled || !mountedRef.current) return;
        setDiff({ phase: "error", message: diffErrorMessage(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, diff.phase, cwd, file.path, file.staged]);

  const chip = chipStyle(file.status);

  return (
    <article className="panel flex flex-col gap-2 p-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className="mono inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[0.625rem] font-medium"
            style={{
              color: chip.color,
              borderColor: chip.color,
              borderWidth: 1,
              backgroundColor: `color-mix(in srgb, ${chip.color} 12%, transparent)`,
            }}
          >
            {chip.label}
          </span>
          <span
            className="mono min-w-0 flex-1 truncate text-xs"
            style={{ color: "var(--color-text)" }}
            title={file.path}
            dir="rtl"
          >
            {file.path}
          </span>
        </button>

        {/* Per-file Revert — destructive, behind an explicit confirm. */}
        {confirming ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onConfirmDiscard}
              disabled={discarding}
              className="mono rounded px-1.5 py-0.5 text-[0.625rem] font-medium tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                color: "var(--color-alert)",
                borderColor: "var(--color-alert)",
                borderWidth: 1,
                backgroundColor: "color-mix(in srgb, var(--color-alert) 14%, transparent)",
              }}
            >
              {discarding ? "…" : "CONFIRM"}
            </button>
            <button
              type="button"
              onClick={onCancelDiscard}
              disabled={discarding}
              className="mono rounded px-1.5 py-0.5 text-[0.625rem] tracking-wider transition-colors disabled:opacity-40"
              style={{ color: "var(--color-muted)", borderColor: "var(--color-line)", borderWidth: 1 }}
            >
              CANCEL
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onRequestDiscard}
            disabled={discarding}
            className="mono shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] font-medium tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: "var(--color-alert)", borderColor: "var(--color-alert)", borderWidth: 1 }}
          >
            REVERT
          </button>
        )}
      </div>

      {discardError ? (
        <p className="mono text-[0.625rem] leading-tight" role="alert" style={{ color: "var(--color-alert)" }}>
          {discardError}
        </p>
      ) : null}

      {expanded ? (
        <div className="border-t pt-2 hairline">
          {diff.phase === "loading" ? (
            <p className="mono text-xs" style={{ color: "var(--color-faint)" }} role="status">
              Loading diff…
            </p>
          ) : diff.phase === "error" ? (
            <p className="mono text-xs leading-relaxed" role="alert" style={{ color: "var(--color-alert)" }}>
              {diff.message}
            </p>
          ) : diff.phase === "ready" ? (
            <DiffView diff={diff.diff} truncated={diff.truncated} />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

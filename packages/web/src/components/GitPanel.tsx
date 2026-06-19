/**
 * GitPanel — review an agent project's working tree from a phone (M4).
 *
 * Renders as a drawer: a full-screen sheet on small screens, a right-side panel
 * on desktop. On open it fetches `git status` for `cwd`. The body shows:
 *   - a header with branch + ahead/behind counts and a close control;
 *   - a file list (status-code chip colored by kind + mono path); clicking a
 *     file lazily loads its unified diff into <DiffView>;
 *   - a footer with a commit message input + Commit, plus a "Revert all"
 *     affordance. Each file row also offers a per-file Revert.
 *
 * Destructive actions (per-file discard and discard-all) are ALWAYS behind an
 * explicit two-step confirm. After any mutation we refetch status so the panel
 * reflects reality. Errors use role="alert" and are never swallowed.
 *
 * Empty/honest states:
 *   - 409 from status        → "Not a git repository"
 *   - clean repo (no files)  → "Working tree clean"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { GitFileChange, GitStatus } from "@mission-control/shared";
import { ApiError, getGitStatus, gitCommit, gitDiscard } from "../lib/api";
import { EmptyState } from "./EmptyState";
import { GitFileRow } from "./GitFileRow";

interface GitPanelProps {
  cwd: string;
  project: string;
  onClose: () => void;
}

/** What the panel is currently doing — drives spinners and disabled states. */
type LoadState = "loading" | "ready" | "not-a-repo" | "error";

function statusErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return `Failed to load status (${err.status})`;
  if (err instanceof Error) return err.message;
  return "Failed to load status";
}

function commitErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return `Commit failed (${err.status})`;
  if (err instanceof Error) return err.message;
  return "Commit failed";
}

function discardErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return `Revert failed (${err.status})`;
  if (err instanceof Error) return err.message;
  return "Revert failed";
}

export function GitPanel({ cwd, project, onClose }: GitPanelProps) {
  const [load, setLoad] = useState<LoadState>("loading");
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitOutput, setCommitOutput] = useState<string | null>(null);

  // Two-step confirm for destructive discards: file path being confirmed, or
  // the sentinel "*" for "revert all". null = nothing pending confirmation.
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  const refetchStatus = useCallback(async (): Promise<void> => {
    try {
      const next = await getGitStatus(cwd);
      if (!mountedRef.current) return;
      setStatus(next);
      setLoad("ready");
      setLoadError(null);
      // Drop a selection that no longer has a changed file backing it.
      setSelected((prev) =>
        prev && next.files.some((f) => f.path === prev) ? prev : null,
      );
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      if (err instanceof ApiError && err.status === 409) {
        setLoad("not-a-repo");
        return;
      }
      setLoad("error");
      setLoadError(statusErrorMessage(err));
    }
  }, [cwd]);

  useEffect(() => {
    mountedRef.current = true;
    void refetchStatus();
    return () => {
      mountedRef.current = false;
    };
  }, [refetchStatus]);

  // Close on Escape — a basic modal affordance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCommit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();
      const trimmed = message.trim();
      if (!trimmed || committing) return;
      setCommitting(true);
      setCommitError(null);
      setCommitOutput(null);
      try {
        const result = await gitCommit(cwd, trimmed);
        if (!mountedRef.current) return;
        setCommitOutput(result.output);
        if (result.committed) setMessage("");
        await refetchStatus();
      } catch (err: unknown) {
        if (mountedRef.current) setCommitError(commitErrorMessage(err));
      } finally {
        if (mountedRef.current) setCommitting(false);
      }
    },
    [cwd, message, committing, refetchStatus],
  );

  const runDiscard = useCallback(
    async (target: string): Promise<void> => {
      if (discarding) return;
      setDiscarding(true);
      setDiscardError(null);
      try {
        // "*" is our local sentinel for "all"; the API takes no file argument.
        await gitDiscard(cwd, target === "*" ? undefined : target);
        if (!mountedRef.current) return;
        setConfirmDiscard(null);
        await refetchStatus();
      } catch (err: unknown) {
        if (mountedRef.current) setDiscardError(discardErrorMessage(err));
      } finally {
        if (mountedRef.current) setDiscarding(false);
      }
    },
    [cwd, discarding, refetchStatus],
  );

  const files: GitFileChange[] = status?.files ?? [];
  const busy = committing || discarding;
  const canCommit = Boolean(message.trim()) && !busy && files.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={`Git review — ${project}`}
    >
      {/* Backdrop — click to dismiss. */}
      <button
        type="button"
        aria-label="Close git review"
        onClick={onClose}
        className="absolute inset-0 h-full w-full"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-void) 70%, transparent)" }}
      />

      {/* Sheet: full-screen on mobile, right-side panel on desktop. */}
      <section
        className="panel relative ml-auto flex h-full w-full flex-col sm:max-w-xl"
        style={{ borderRadius: 0 }}
      >
        <Header
          project={project}
          cwd={cwd}
          status={status}
          loadState={load}
          onClose={onClose}
        />

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <Body
            loadState={load}
            loadError={loadError}
            files={files}
            cwd={cwd}
            selected={selected}
            onSelect={(path) => setSelected((prev) => (prev === path ? null : path))}
            confirmDiscard={confirmDiscard}
            discarding={discarding}
            onRequestDiscard={(path) => {
              setDiscardError(null);
              setConfirmDiscard(path);
            }}
            onCancelDiscard={() => setConfirmDiscard(null)}
            onConfirmDiscard={(path) => void runDiscard(path)}
            discardError={discardError}
          />
        </div>

        {load === "ready" && files.length > 0 ? (
          <Footer
            message={message}
            onMessageChange={setMessage}
            onCommit={handleCommit}
            canCommit={canCommit}
            committing={committing}
            commitError={commitError}
            commitOutput={commitOutput}
            confirmDiscardAll={confirmDiscard === "*"}
            discarding={discarding}
            busy={busy}
            onRequestDiscardAll={() => {
              setDiscardError(null);
              setConfirmDiscard("*");
            }}
            onCancelDiscardAll={() => setConfirmDiscard(null)}
            onConfirmDiscardAll={() => void runDiscard("*")}
          />
        ) : null}
      </section>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

interface HeaderProps {
  project: string;
  cwd: string;
  status: GitStatus | null;
  loadState: LoadState;
  onClose: () => void;
}

function Header({ project, cwd, status, loadState, onClose }: HeaderProps) {
  return (
    <header className="flex items-start justify-between gap-3 border-b p-3 hairline">
      <div className="min-w-0">
        <h2
          className="mono truncate text-sm font-semibold"
          style={{ color: "var(--color-text)" }}
          title={cwd}
        >
          {project}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {loadState === "ready" && status ? (
            <>
              <span className="mono text-xs" style={{ color: "var(--color-cool)" }}>
                {status.branch || "(detached)"}
              </span>
              {status.ahead > 0 ? (
                <span className="mono text-[0.625rem]" style={{ color: "var(--color-ok)" }}>
                  ↑{status.ahead}
                </span>
              ) : null}
              {status.behind > 0 ? (
                <span className="mono text-[0.625rem]" style={{ color: "var(--color-signal)" }}>
                  ↓{status.behind}
                </span>
              ) : null}
            </>
          ) : (
            <span className="caption">{loadState === "loading" ? "loading…" : "git"}</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="mono shrink-0 rounded-md px-2 py-1 text-xs tracking-wider transition-colors"
        style={{ color: "var(--color-muted)", border: "1px solid var(--color-line)" }}
      >
        CLOSE
      </button>
    </header>
  );
}

// ─── Body ────────────────────────────────────────────────────────────────────

interface BodyProps {
  loadState: LoadState;
  loadError: string | null;
  files: GitFileChange[];
  cwd: string;
  selected: string | null;
  onSelect: (path: string) => void;
  confirmDiscard: string | null;
  discarding: boolean;
  onRequestDiscard: (path: string) => void;
  onCancelDiscard: () => void;
  onConfirmDiscard: (path: string) => void;
  discardError: string | null;
}

function Body({
  loadState,
  loadError,
  files,
  cwd,
  selected,
  onSelect,
  confirmDiscard,
  discarding,
  onRequestDiscard,
  onCancelDiscard,
  onConfirmDiscard,
  discardError,
}: BodyProps) {
  if (loadState === "loading") {
    return (
      <p className="mono text-xs" style={{ color: "var(--color-faint)" }} role="status">
        Loading status…
      </p>
    );
  }

  if (loadState === "not-a-repo") {
    return (
      <EmptyState
        title="Not a git repository"
        hint="This agent's working directory isn't version-controlled, so there's nothing to review."
      />
    );
  }

  if (loadState === "error") {
    return (
      <p className="mono text-xs leading-relaxed" role="alert" style={{ color: "var(--color-alert)" }}>
        {loadError ?? "Failed to load status."}
      </p>
    );
  }

  if (files.length === 0) {
    return (
      <EmptyState
        title="Working tree clean"
        hint="No uncommitted changes in this project."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {files.map((file) => (
        <li key={`${file.path}:${file.staged ? "s" : "w"}`}>
          <GitFileRow
            file={file}
            cwd={cwd}
            expanded={selected === file.path}
            onToggle={() => onSelect(file.path)}
            confirming={confirmDiscard === file.path}
            discarding={discarding}
            onRequestDiscard={() => onRequestDiscard(file.path)}
            onCancelDiscard={onCancelDiscard}
            onConfirmDiscard={() => onConfirmDiscard(file.path)}
            discardError={confirmDiscard === file.path ? discardError : null}
          />
        </li>
      ))}
    </ul>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

interface FooterProps {
  message: string;
  onMessageChange: (value: string) => void;
  onCommit: (e: React.FormEvent) => void;
  canCommit: boolean;
  committing: boolean;
  commitError: string | null;
  commitOutput: string | null;
  confirmDiscardAll: boolean;
  discarding: boolean;
  busy: boolean;
  onRequestDiscardAll: () => void;
  onCancelDiscardAll: () => void;
  onConfirmDiscardAll: () => void;
}

function Footer({
  message,
  onMessageChange,
  onCommit,
  canCommit,
  committing,
  commitError,
  commitOutput,
  confirmDiscardAll,
  discarding,
  busy,
  onRequestDiscardAll,
  onCancelDiscardAll,
  onConfirmDiscardAll,
}: FooterProps) {
  return (
    <form onSubmit={onCommit} className="flex flex-col gap-2 border-t p-3 hairline">
      <label htmlFor="git-commit-message" className="flex flex-col gap-1">
        <span className="caption">commit message</span>
        <input
          id="git-commit-message"
          type="text"
          value={message}
          placeholder="Describe the change"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          onChange={(e) => onMessageChange(e.target.value)}
          className="rounded-md px-2 py-1.5 text-sm outline-none disabled:opacity-50"
          style={{
            backgroundColor: "var(--color-void)",
            color: "var(--color-text)",
            border: "1px solid var(--color-line)",
          }}
        />
      </label>

      {commitOutput ? (
        <pre
          className="mono overflow-x-auto whitespace-pre-wrap text-[0.625rem] leading-tight"
          style={{ color: "var(--color-muted)", margin: 0 }}
          role="status"
        >
          {commitOutput}
        </pre>
      ) : null}

      {commitError ? (
        <p className="mono text-[0.625rem] leading-tight" role="alert" style={{ color: "var(--color-alert)" }}>
          {commitError}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        {/* Destructive: "Revert all" gated behind an explicit confirm. */}
        {confirmDiscardAll ? (
          <div className="flex items-center gap-2">
            <span className="mono text-[0.625rem]" style={{ color: "var(--color-alert)" }}>
              Discard ALL changes?
            </span>
            <button
              type="button"
              onClick={onConfirmDiscardAll}
              disabled={discarding}
              className="mono rounded-md px-2 py-1 text-[0.625rem] font-medium tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                color: "var(--color-alert)",
                border: "1px solid var(--color-alert)",
                backgroundColor: "color-mix(in srgb, var(--color-alert) 14%, transparent)",
              }}
            >
              {discarding ? "REVERTING…" : "CONFIRM"}
            </button>
            <button
              type="button"
              onClick={onCancelDiscardAll}
              disabled={discarding}
              className="mono rounded-md px-2 py-1 text-[0.625rem] tracking-wider transition-colors disabled:opacity-40"
              style={{ color: "var(--color-muted)", border: "1px solid var(--color-line)" }}
            >
              CANCEL
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onRequestDiscardAll}
            disabled={busy}
            className="mono rounded-md px-2 py-1 text-[0.625rem] font-medium tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: "var(--color-alert)", border: "1px solid var(--color-alert)" }}
          >
            REVERT ALL
          </button>
        )}

        <button
          type="submit"
          disabled={!canCommit}
          className="mono rounded-md px-3 py-1.5 text-xs font-medium tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            color: "var(--color-ok)",
            border: "1px solid var(--color-ok)",
            backgroundColor: "color-mix(in srgb, var(--color-ok) 10%, transparent)",
          }}
        >
          {committing ? "COMMITTING…" : "COMMIT"}
        </button>
      </div>
    </form>
  );
}

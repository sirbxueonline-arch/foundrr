/**
 * ChangesPage — the "Code changes" surface. Lists every session (most recent
 * first) with its project, working dir, and edit count, and a Review button that
 * opens the same GitPanel the agent cards use — so all of an agent's diffs are
 * reachable from one place instead of being buried inside each card.
 */
import { useState } from "react";
import type { AgentSession } from "@mission-control/shared";
import { GitPanel } from "./GitPanel";
import { EmptyState } from "./EmptyState";
import { shortPath } from "../lib/format";

interface ChangesPageProps {
  sessions: AgentSession[];
}

export function ChangesPage({ sessions }: ChangesPageProps) {
  const [reviewing, setReviewing] = useState<AgentSession | null>(null);

  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No sessions yet"
        hint="Start Claude Code in any project and its uncommitted changes become reviewable here."
      />
    );
  }

  const ordered = [...sessions].sort((a, b) => b.lastEventAt - a.lastEventAt);

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-1">
      {ordered.map((session) => (
        <article
          key={session.sessionId}
          className="panel flex items-center justify-between gap-3 p-3.5"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="truncate text-sm font-medium" style={{ color: "var(--color-text)" }}>
              {session.project}
            </h3>
            <p
              className="mono truncate text-[0.6875rem]"
              title={session.cwd}
              style={{ color: "var(--color-faint)" }}
            >
              {shortPath(session.cwd)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="mono text-xs tabular-nums" style={{ color: "var(--color-muted)" }}>
              {session.stats.filesEdited} {session.stats.filesEdited === 1 ? "file" : "files"}
            </span>
            <button type="button" onClick={() => setReviewing(session)} className="pill pill-cool">
              Review
            </button>
          </div>
        </article>
      ))}

      {reviewing ? (
        <GitPanel
          cwd={reviewing.cwd}
          project={reviewing.project}
          onClose={() => setReviewing(null)}
        />
      ) : null}
    </div>
  );
}

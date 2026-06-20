/**
 * AgentsPanel — renders the live Claude Code sessions as a column of
 * AgentCards. Sessions arrive already sorted (active first) from useStream.
 *
 * To keep the active work front-and-center, only ACTIVE / WAITING / ERROR and
 * recently-active IDLE sessions are shown by default; the long tail of ENDED
 * and long-idle sessions is collapsed behind a "Show N ended" toggle so a
 * handful of running agents never gets buried under yesterday's sessions.
 *
 * With no sessions at all, it shows an honest empty state with the real next
 * action.
 */
import { useState } from "react";
import type { AgentSession, CostSnapshot } from "@mission-control/shared";
import { AgentCard } from "./AgentCard";
import { EmptyState } from "./EmptyState";
import { partitionSessions } from "../lib/sessions";

interface AgentsPanelProps {
  sessions: AgentSession[];
  /** Daemon-derived "now" for stable relative-time rendering. */
  now: number;
  /** Live cost telemetry; cards look up their own session by id. */
  cost: CostSnapshot | null;
}

interface SessionListProps {
  sessions: AgentSession[];
  now: number;
  cost: CostSnapshot | null;
}

function SessionList({ sessions, now, cost }: SessionListProps) {
  return (
    <div className="flex flex-col gap-3">
      {sessions.map((session) => (
        <AgentCard
          key={session.sessionId}
          session={session}
          now={now}
          cost={cost?.sessions[session.sessionId]}
        />
      ))}
    </div>
  );
}

export function AgentsPanel({ sessions, now, cost }: AgentsPanelProps) {
  const [showArchived, setShowArchived] = useState(false);

  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No active sessions"
        hint="Start Claude Code in any project and it will show up here, live."
        action={
          <p className="mono text-xs leading-relaxed" style={{ color: "var(--color-faint)" }}>
            If nothing shows up, run{" "}
            <code style={{ color: "var(--color-cool)" }}>mc hooks install</code> then{" "}
            <code style={{ color: "var(--color-cool)" }}>mc doctor</code>.
          </p>
        }
      />
    );
  }

  const { primary, archived } = partitionSessions(sessions, now);
  const hasArchived = archived.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {primary.length > 0 ? (
        <SessionList sessions={primary} now={now} cost={cost} />
      ) : (
        // Every session is finished/idle — keep the surface honest rather than
        // showing a blank column above the toggle.
        <p
          className="px-1 py-2 text-center text-xs leading-relaxed"
          style={{ color: "var(--color-faint)" }}
        >
          No active sessions right now.
        </p>
      )}

      {hasArchived ? (
        <>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            className="mono self-center rounded-md px-3 py-1.5 text-[0.625rem] font-medium tracking-wider transition-colors"
            style={{
              color: "var(--color-muted)",
              border: "1px solid var(--color-line)",
            }}
          >
            {showArchived
              ? `Hide ${archived.length} ended`
              : `Show ${archived.length} ended`}
          </button>
          {showArchived ? <SessionList sessions={archived} now={now} cost={cost} /> : null}
        </>
      ) : null}
    </div>
  );
}

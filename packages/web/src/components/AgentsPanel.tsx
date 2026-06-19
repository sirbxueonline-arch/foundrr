/**
 * AgentsPanel — renders the live Claude Code sessions as a column of
 * AgentCards. Sessions arrive already sorted (active first) from useStream.
 * With no sessions, it shows an honest empty state with the real next action.
 */
import type { AgentSession, CostSnapshot } from "@mission-control/shared";
import { AgentCard } from "./AgentCard";
import { EmptyState } from "./EmptyState";

interface AgentsPanelProps {
  sessions: AgentSession[];
  /** Daemon-derived "now" for stable relative-time rendering. */
  now: number;
  /** Live cost telemetry; cards look up their own session by id. */
  cost: CostSnapshot | null;
}

export function AgentsPanel({ sessions, now, cost }: AgentsPanelProps) {
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

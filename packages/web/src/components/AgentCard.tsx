/**
 * AgentCard — one Claude Code session rendered as a telemetry panel.
 *
 * Header:   project name (mono, prominent) · StatusPill · Pulse (only when the
 *           session is active or waiting).
 * Activity: the current-activity one-liner (mono), color-keyed to its kind.
 * Stats:    the StatRow (files / tools / cmds / subagents / prompts / uptime).
 * History:  the latest few achievements with faint relative timestamps.
 *
 * Layout is fixed/stable so live field updates never cause a shift.
 */
import { useState } from "react";
import type { AgentSession, CurrentActivity } from "@mission-control/shared";
import { Pulse } from "./Pulse";
import { StatusPill } from "./StatusPill";
import { StatRow } from "./StatRow";
import { GitPanel } from "./GitPanel";
import { relativeTime, truncate, usd, compactTokens } from "../lib/format";

interface SessionCost {
  usd: number;
  tokens: number;
}

interface AgentCardProps {
  session: AgentSession;
  /** Daemon-derived "now" (epoch ms) for stable relative-time rendering. */
  now: number;
  /** This session's cost/token totals, if telemetry has any for it. */
  cost?: SessionCost;
}

const MAX_ACHIEVEMENTS = 5;
const ACTIVITY_MAX_CHARS = 72;

function activityColor(kind: CurrentActivity["kind"]): string {
  switch (kind) {
    case "tool":
    case "prompt":
      return "var(--color-text)";
    case "waiting":
      return "var(--color-signal)";
    case "error":
      return "var(--color-alert)";
    case "idle":
    default:
      return "var(--color-muted)";
  }
}

export function AgentCard({ session, now, cost }: AgentCardProps) {
  const isLive = session.status === "active" || session.status === "waiting";
  const isEnded = session.status === "ended";
  const achievements = session.achievements.slice(0, MAX_ACHIEVEMENTS);
  const [reviewing, setReviewing] = useState(false);

  return (
    // Ended sessions sit quietly dimmed so the live ones own the column.
    <article
      className="panel flex flex-col gap-3 p-3 transition-opacity sm:p-4"
      style={{ opacity: isEnded ? 0.62 : 1 }}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Pulse active={isLive} label={`${session.project} ${session.status}`} />
          <h3
            className="mono truncate text-base font-semibold"
            title={session.cwd}
            style={{ color: "var(--color-text)" }}
          >
            {session.project}
          </h3>
        </div>
        <StatusPill status={session.status} />
      </header>

      <p
        className="mono min-h-[1.25rem] text-sm leading-tight"
        style={{ color: activityColor(session.current.kind) }}
        title={session.current.label}
      >
        {truncate(session.current.label, ACTIVITY_MAX_CHARS)}
      </p>

      <StatRow stats={session.stats} startedAt={session.startedAt} now={now} />

      {cost ? (
        <p
          className="mono flex items-baseline gap-2 text-xs leading-none"
          aria-label={`${usd(cost.usd)} this session, ${compactTokens(cost.tokens)} tokens`}
        >
          <span className="tabular-nums" style={{ color: "var(--color-signal)" }}>
            {usd(cost.usd)}
          </span>
          <span className="tabular-nums" style={{ color: "var(--color-muted)" }}>
            {compactTokens(cost.tokens)} tok
          </span>
          <span className="caption">this session</span>
        </p>
      ) : null}

      <section className="flex flex-col gap-1.5 border-t pt-3 hairline" aria-label="Recent activity">
        {achievements.length === 0 ? (
          <p className="caption">No activity yet</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {achievements.map((a) => (
              <li
                key={`${a.ts}-${a.kind}-${a.text}`}
                className="mono flex items-baseline gap-2 text-xs leading-tight"
              >
                <span
                  className="w-8 shrink-0 text-right tabular-nums"
                  style={{ color: "var(--color-faint)" }}
                >
                  {relativeTime(a.ts, now)}
                </span>
                <span className="min-w-0 truncate" style={{ color: "var(--color-muted)" }}>
                  {a.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="flex justify-end border-t pt-3 hairline">
        <button
          type="button"
          onClick={() => setReviewing(true)}
          className="mono rounded-md px-3 py-1.5 text-[0.625rem] font-medium tracking-wider transition-colors"
          style={{
            color: "var(--color-cool)",
            border: "1px solid var(--color-line)",
          }}
        >
          REVIEW CHANGES
        </button>
      </footer>

      {reviewing ? (
        <GitPanel
          cwd={session.cwd}
          project={session.project}
          onClose={() => setReviewing(false)}
        />
      ) : null}
    </article>
  );
}

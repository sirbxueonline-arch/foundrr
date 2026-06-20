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
import { relativeTime, truncate, usd, compactTokens, uptime, shortPath } from "../lib/format";

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
      // The live current-activity line reads in --cool (interactive/info), per
      // the doc — it's "what the agent is doing", not a status alarm.
      return "var(--color-cool)";
    case "waiting":
      // Amber-ink so the "waiting" activity line stays AA on the light card.
      return "var(--color-signal-ink)";
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
    // Active cards carry a thin amber left edge + subtle glow; idle/ended cards
    // are fully neutral (amber appears only when the machine is working). Ended
    // sessions sit quietly dimmed so the live ones own the column.
    <article
      className={`panel flex flex-col gap-3 p-4 transition-opacity${
        isLive ? " card-active" : ""
      }`}
      style={{ opacity: isEnded ? 0.6 : 1 }}
    >
      {/* Identity anchor: the project name in humanist sans (the eye lands here),
          its working dir in faint mono beneath it. Uptime + status sit opposite,
          so "what / where" reads left and "how long / state" reads right. */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-1 shrink-0">
            <Pulse active={isLive} label={`${session.project} ${session.status}`} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3
              className="truncate text-[0.9375rem] font-medium leading-tight tracking-tight"
              style={{ color: "var(--color-text)" }}
            >
              {session.project}
            </h3>
            <p
              className="mono truncate text-[0.6875rem] leading-none"
              title={session.cwd}
              style={{ color: "var(--color-faint)" }}
            >
              {shortPath(session.cwd)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span
            className="mono text-[0.625rem] tabular-nums"
            title="Session uptime"
            style={{ color: "var(--color-faint)" }}
          >
            {uptime(session.startedAt, now)}
          </span>
          <StatusPill status={session.status} />
        </div>
      </header>

      {/* Live one-liner of what the agent is doing now, with this session's spend
          anchored to the right of the same line so the card reads as one tidy
          status row rather than two stacked facts. */}
      <div className="flex items-baseline justify-between gap-3">
        <p
          className="mono min-w-0 flex-1 truncate text-xs leading-tight"
          style={{ color: activityColor(session.current.kind) }}
          title={session.current.label}
        >
          {truncate(session.current.label, ACTIVITY_MAX_CHARS)}
        </p>
        {cost ? (
          <span
            className="mono flex shrink-0 items-baseline gap-1.5 text-[0.6875rem] leading-none tabular-nums"
            aria-label={`${usd(cost.usd)} this session, ${compactTokens(cost.tokens)} tokens`}
          >
            <span style={{ color: "var(--color-signal-ink)" }}>{usd(cost.usd)}</span>
            <span style={{ color: "var(--color-faint)" }}>{compactTokens(cost.tokens)} tok</span>
          </span>
        ) : null}
      </div>

      <StatRow stats={session.stats} />

      {/* Recent activity on a recessed inset — depth in place of yet another
          hairline divider. A fixed faint timestamp column keeps the log aligned
          and scannable without the noisy per-line bullet. */}
      <section
        className="flex flex-col gap-1.5 rounded-lg px-3 py-2.5"
        style={{ backgroundColor: "var(--color-inset)" }}
        aria-label="Recent activity"
      >
        {achievements.length === 0 ? (
          <p className="caption">No activity yet</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {achievements.map((a) => (
              <li
                key={`${a.ts}-${a.kind}-${a.text}`}
                className="mono flex items-baseline gap-2.5 text-[0.6875rem] leading-tight"
              >
                <span
                  className="w-7 shrink-0 text-right tabular-nums"
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

      <footer className="flex justify-end">
        <button
          type="button"
          onClick={() => setReviewing(true)}
          className="pill pill-cool"
        >
          Review changes
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

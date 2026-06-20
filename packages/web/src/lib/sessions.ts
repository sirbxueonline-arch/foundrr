/**
 * Pure helpers for triaging the Agents list so the active sessions stay front
 * and center and the long tail of finished ones gets tucked away.
 *
 * The daemon already sorts sessions active-first, so these helpers only decide
 * which sessions belong in the always-visible group versus the collapsible
 * "ended" group — they never reorder within a group.
 */
import type { AgentSession } from "@mission-control/shared";

/**
 * An IDLE session is still worth showing inline if it did something in the
 * recent past — a session that paused 30s ago reads very differently from one
 * that has been quiet for an hour. Beyond this window, idle sessions fold into
 * the collapsible group with the ended ones.
 */
export const RECENT_IDLE_MS = 10 * 60 * 1000; // 10 minutes

export interface PartitionedSessions {
  /** ACTIVE + WAITING + ERROR + recently-active IDLE — always shown. */
  primary: AgentSession[];
  /** ENDED + long-idle sessions — collapsed behind a toggle. */
  archived: AgentSession[];
}

/**
 * Decide whether a session belongs in the always-visible group. Active, waiting
 * and error sessions always do; idle ones do only if they were active within
 * `RECENT_IDLE_MS`; ended ones never do.
 */
function isPrimary(session: AgentSession, now: number): boolean {
  switch (session.status) {
    case "active":
    case "waiting":
    case "error":
      return true;
    case "idle":
      return now - session.lastEventAt <= RECENT_IDLE_MS;
    case "ended":
    default:
      return false;
  }
}

/**
 * Split already-sorted sessions into the always-visible primary group and the
 * collapsible archived group. Relative order within each group is preserved.
 */
export function partitionSessions(
  sessions: AgentSession[],
  now: number,
): PartitionedSessions {
  const primary: AgentSession[] = [];
  const archived: AgentSession[] = [];
  for (const session of sessions) {
    if (isPrimary(session, now)) primary.push(session);
    else archived.push(session);
  }
  return { primary, archived };
}

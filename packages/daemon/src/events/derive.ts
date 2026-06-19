/**
 * Pure session-state derivation. Given the previous AgentSession (or undefined)
 * and an incoming hook event, produce the next AgentSession. No I/O, no mutation.
 */
import {
  bashCommand,
  filePath,
  type Achievement,
  type AgentSession,
  type AgentStatus,
  type CurrentActivity,
  type IncomingHookEvent,
  type RecentEvent,
} from "@mission-control/shared";

import { ACHIEVEMENTS_CAP, RECENT_CAP } from "../constants.js";
import {
  describeTool,
  isEditTool,
  projectFromCwd,
  toolTarget,
  truncate,
} from "./describe.js";

/** Build a brand-new session shell with empty stats. */
function freshSession(
  ev: IncomingHookEvent,
  now: number,
  prev: AgentSession | undefined,
): AgentSession {
  const cwd = ev.cwd ?? prev?.cwd ?? "";
  return {
    sessionId: ev.session_id,
    project: projectFromCwd(ev.cwd ?? prev?.cwd),
    cwd,
    status: "active",
    current: { kind: "idle", label: "Session started", since: now },
    stats: { filesEdited: 0, tools: 0, commands: 0, subagents: 0, prompts: 0 },
    filesEditedList: [],
    achievements: [],
    recent: [],
    startedAt: prev?.startedAt ?? now,
    lastEventAt: now,
  };
}

/** Carry forward the previous session, refreshing cwd/project if newly known. */
function carryForward(
  prev: AgentSession | undefined,
  ev: IncomingHookEvent,
  now: number,
): AgentSession {
  const base = prev ?? freshSession(ev, now, prev);
  const cwd = base.cwd || ev.cwd || "";
  return {
    ...base,
    cwd,
    project: base.project !== "unknown" ? base.project : projectFromCwd(ev.cwd),
  };
}

function pushRecent(
  session: AgentSession,
  ev: IncomingHookEvent,
  now: number,
): RecentEvent[] {
  const entry: RecentEvent = {
    ts: now,
    event: ev.hook_event_name,
    detail: recentDetail(ev),
  };
  return [entry, ...session.recent].slice(0, RECENT_CAP);
}

function recentDetail(ev: IncomingHookEvent): string {
  if (ev.prompt) return truncate(ev.prompt);
  if (ev.tool_name) {
    const target = toolTarget(ev);
    return target ? `${ev.tool_name}: ${truncate(target)}` : ev.tool_name;
  }
  if (ev.message) return truncate(ev.message);
  return ev.reason ?? "";
}

function pushAchievement(
  session: AgentSession,
  achievement: Achievement,
): Achievement[] {
  return [achievement, ...session.achievements].slice(0, ACHIEVEMENTS_CAP);
}

function withCommon(
  session: AgentSession,
  ev: IncomingHookEvent,
  now: number,
): AgentSession {
  return {
    ...session,
    lastEventAt: now,
    recent: pushRecent(session, ev, now),
  };
}

function setStatus(session: AgentSession, status: AgentStatus): AgentSession {
  return { ...session, status };
}

function setCurrent(
  session: AgentSession,
  current: CurrentActivity,
): AgentSession {
  return { ...session, current };
}

// ─── per-event handlers ──────────────────────────────────────────────────────

function onUserPrompt(
  session: AgentSession,
  ev: IncomingHookEvent,
  now: number,
): AgentSession {
  const prompt = ev.prompt ?? "";
  const next: AgentSession = {
    ...session,
    status: "active",
    stats: { ...session.stats, prompts: session.stats.prompts + 1 },
    lastPrompt: prompt,
    current: { kind: "prompt", label: `Prompt: ${truncate(prompt)}`, since: now },
    achievements: pushAchievement(session, {
      ts: now,
      kind: "prompt",
      text: `Prompt: ${truncate(prompt)}`,
    }),
  };
  return next;
}

function onPreToolUse(
  session: AgentSession,
  ev: IncomingHookEvent,
  now: number,
): AgentSession {
  const current: CurrentActivity = {
    kind: "tool",
    label: describeTool(ev),
    since: now,
    ...(ev.tool_name ? { tool: ev.tool_name } : {}),
    ...(toolTarget(ev) ? { target: toolTarget(ev) } : {}),
  };
  return setStatus(setCurrent(session, current), "active");
}

function onPostToolUse(
  session: AgentSession,
  ev: IncomingHookEvent,
  now: number,
): AgentSession {
  let next: AgentSession = {
    ...session,
    status: "active",
    stats: { ...session.stats, tools: session.stats.tools + 1 },
  };

  const tool = ev.tool_name;
  if (isEditTool(tool)) {
    const fp = filePath(ev.tool_input);
    if (fp) {
      const filesEditedList = next.filesEditedList.includes(fp)
        ? next.filesEditedList
        : [...next.filesEditedList, fp];
      next = {
        ...next,
        filesEditedList,
        stats: { ...next.stats, filesEdited: filesEditedList.length },
        achievements: pushAchievement(next, {
          ts: now,
          kind: "edit",
          text: `Edited ${truncate(fp)}`,
        }),
      };
    }
  } else if (tool === "Bash") {
    const cmd = bashCommand(ev.tool_input);
    next = {
      ...next,
      stats: { ...next.stats, commands: next.stats.commands + 1 },
      achievements: pushAchievement(next, {
        ts: now,
        kind: "command",
        text: cmd ? `Ran: ${truncate(cmd)}` : "Ran a command",
      }),
    };
  }
  return next;
}

function onSubagentStop(session: AgentSession, now: number): AgentSession {
  return {
    ...session,
    stats: { ...session.stats, subagents: session.stats.subagents + 1 },
    achievements: pushAchievement(session, {
      ts: now,
      kind: "subagent",
      text: "Subagent finished",
    }),
  };
}

function onNotification(
  session: AgentSession,
  ev: IncomingHookEvent,
  now: number,
): AgentSession {
  const label = ev.message?.trim() ? truncate(ev.message) : "Needs attention";
  return {
    ...session,
    status: "waiting",
    current: { kind: "waiting", label, since: now },
    achievements: pushAchievement(session, {
      ts: now,
      kind: "notification",
      text: label,
    }),
  };
}

function onStop(session: AgentSession, now: number): AgentSession {
  return {
    ...session,
    status: "idle",
    current: { kind: "idle", label: "Idle — finished", since: now },
  };
}

/**
 * Derive the next session from the previous state and an incoming hook event.
 * Always pure; callers persist/broadcast the returned value.
 */
export function deriveSession(
  prev: AgentSession | undefined,
  ev: IncomingHookEvent,
  now: number,
): AgentSession {
  switch (ev.hook_event_name) {
    case "SessionStart": {
      return withCommon(freshSession(ev, now, prev), ev, now);
    }
    case "UserPromptSubmit": {
      return withCommon(onUserPrompt(carryForward(prev, ev, now), ev, now), ev, now);
    }
    case "PreToolUse": {
      return withCommon(onPreToolUse(carryForward(prev, ev, now), ev, now), ev, now);
    }
    case "PostToolUse": {
      return withCommon(onPostToolUse(carryForward(prev, ev, now), ev, now), ev, now);
    }
    case "SubagentStop": {
      return withCommon(onSubagentStop(carryForward(prev, ev, now), now), ev, now);
    }
    case "Notification": {
      return withCommon(onNotification(carryForward(prev, ev, now), ev, now), ev, now);
    }
    case "Stop": {
      return withCommon(onStop(carryForward(prev, ev, now), now), ev, now);
    }
    case "SessionEnd": {
      return withCommon(setStatus(carryForward(prev, ev, now), "ended"), ev, now);
    }
    case "PreCompact":
    default: {
      // Unknown / non-state-changing events: record but don't alter status.
      return withCommon(carryForward(prev, ev, now), ev, now);
    }
  }
}

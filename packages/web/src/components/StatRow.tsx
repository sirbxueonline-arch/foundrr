/**
 * StatRow — a compact mono row of session telemetry. Each cell shows a value
 * (JetBrains Mono, tabular) above a tiny faint caption. Uses fixed cells so
 * updating values never shifts layout.
 */
import type { AgentStats } from "@mission-control/shared";
import { uptime } from "../lib/format";

interface StatRowProps {
  stats: AgentStats;
  /** Session start (epoch ms) used to render live uptime. */
  startedAt: number;
  /** Daemon-derived "now" so uptime stays correct under clock skew. */
  now: number;
}

interface Cell {
  caption: string;
  value: string;
}

export function StatRow({ stats, startedAt, now }: StatRowProps) {
  const cells: Cell[] = [
    { caption: "files", value: String(stats.filesEdited) },
    { caption: "tools", value: String(stats.tools) },
    { caption: "cmds", value: String(stats.commands) },
    { caption: "subagents", value: String(stats.subagents) },
    { caption: "prompts", value: String(stats.prompts) },
    { caption: "uptime", value: uptime(startedAt, now) },
  ];

  return (
    // 2 rows of 3 on mobile, one row of 6 on desktop. Each stat owns its own grid
    // cell, so labels (e.g. SUBAGENTS / PROMPTS) can never overlap at 390px.
    <dl className="grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-6">
      {cells.map((cell) => (
        <div key={cell.caption} className="flex min-w-0 flex-col items-start gap-1">
          <dd
            className="mono text-sm leading-none tabular-nums"
            style={{ color: "var(--color-text)" }}
          >
            {cell.value}
          </dd>
          <dt className="caption w-full truncate text-[10px]">{cell.caption}</dt>
        </div>
      ))}
    </dl>
  );
}

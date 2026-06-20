/**
 * StatRow — the session's work counters as a single refined metric strip.
 *
 * Each metric reads as "<value> <label>" inline (e.g. "13 tools"), with the
 * value carried in JetBrains Mono / tabular numerals and the label in a quiet
 * lowercase sans. Metrics are separated by thin hairline rules rather than boxed
 * into a grid — Aqua separates with hairlines + whitespace, and an inline strip
 * avoids the generic "number stacked over an uppercase micro-caption" look.
 *
 * A metric whose value is 0 is dimmed (not hidden, so the strip never reflows),
 * which lets the eye land on what's actually happened this session.
 */
import type { AgentStats } from "@mission-control/shared";

interface StatRowProps {
  stats: AgentStats;
}

interface Metric {
  label: string;
  value: number;
}

export function StatRow({ stats }: StatRowProps) {
  const metrics: Metric[] = [
    { label: "files", value: stats.filesEdited },
    { label: "tools", value: stats.tools },
    { label: "cmds", value: stats.commands },
    { label: "subagents", value: stats.subagents },
    { label: "prompts", value: stats.prompts },
  ];

  return (
    // Whitespace-separated inline metrics (Aqua favors whitespace over rules).
    // A generous gap-x keeps each "value label" pair distinct; wrapping on a
    // narrow phone leaves no stray separators behind.
    <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="flex items-baseline gap-1.5"
          style={{ opacity: metric.value === 0 ? 0.4 : 1 }}
        >
          <dd
            className="mono text-sm font-medium leading-none tabular-nums"
            style={{ color: "var(--color-text)" }}
          >
            {metric.value}
          </dd>
          <dt className="text-[0.6875rem] leading-none" style={{ color: "var(--color-faint)" }}>
            {metric.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}

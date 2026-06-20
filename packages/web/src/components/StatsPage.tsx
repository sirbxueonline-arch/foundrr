/**
 * StatsPage — an at-a-glance totals board for the whole dev box: how long agents
 * have been running, what they've spent (money + tokens), and how much work
 * they've done (files / tools / commands / subagents / prompts).
 *
 * All figures are derived from the live stream the dashboard already holds —
 * the running sessions and the cost snapshot — so it needs no extra endpoint.
 * "Live runtime" sums the uptime of every currently-active session; "tracked
 * spend" sums the per-session cost the telemetry has recorded.
 */
import type { AgentSession, CostSnapshot } from "@mission-control/shared";
import { usd, compactTokens, uptime } from "../lib/format";

interface StatsPageProps {
  sessions: AgentSession[];
  cost: CostSnapshot | null;
  /** Daemon-derived "now" (epoch ms) for stable runtime math. */
  now: number;
}

function sum(values: number[]): number {
  return values.reduce((total, n) => total + n, 0);
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  /** Tint the value amber (reserved for the live/primary figures). */
  accent?: boolean;
}

function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <div className="panel flex flex-col gap-1.5 p-4">
      <span className="section-label">{label}</span>
      <span
        className="mono text-2xl font-medium leading-none tabular-nums"
        style={{ color: accent ? "var(--color-signal-ink)" : "var(--color-text)" }}
      >
        {value}
      </span>
      {sub ? (
        <span className="mono text-[0.6875rem] leading-none" style={{ color: "var(--color-faint)" }}>
          {sub}
        </span>
      ) : null}
    </div>
  );
}

export function StatsPage({ sessions, cost, now }: StatsPageProps) {
  const active = sessions.filter((s) => s.status === "active" || s.status === "waiting");
  const ended = sessions.filter((s) => s.status === "ended");

  // Live runtime = combined uptime of every session working right now. Format a
  // duration by feeding uptime() a synthetic "start" that is `runtime` ago.
  const liveRuntimeMs = sum(active.map((s) => Math.max(0, now - s.startedAt)));
  const liveRuntime = liveRuntimeMs > 0 ? uptime(now - liveRuntimeMs, now) : "0s";

  // Spend: today's figure + the ALL-TIME totals, both persisted to SQLite on the
  // daemon so they survive restarts (no longer a per-run sum that resets).
  const totalUsd = cost?.lifetimeUsd ?? 0;
  const totalTokens = cost?.lifetimeTokens ?? 0;

  const work = {
    files: sum(sessions.map((s) => s.stats.filesEdited)),
    tools: sum(sessions.map((s) => s.stats.tools)),
    commands: sum(sessions.map((s) => s.stats.commands)),
    subagents: sum(sessions.map((s) => s.stats.subagents)),
    prompts: sum(sessions.map((s) => s.stats.prompts)),
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-1">
      <section aria-label="Activity">
        <h3 className="section-label mb-3">Activity</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Active now" value={String(active.length)} accent={active.length > 0} sub="agents working" />
          <StatCard label="Live runtime" value={liveRuntime} sub="combined uptime" />
          <StatCard label="Sessions" value={String(sessions.length)} sub={`${ended.length} ended`} />
          <StatCard label="Prompts" value={String(work.prompts)} sub="total sent" />
        </div>
      </section>

      <section aria-label="Spend">
        <h3 className="section-label mb-3">Spend</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Today"
            value={cost ? usd(cost.todayUsd) : "—"}
            accent
            sub={cost ? `${compactTokens(cost.todayTokens)} tokens` : "telemetry off"}
          />
          <StatCard
            label="Tracked total"
            value={cost ? usd(totalUsd) : "—"}
            sub={cost ? `${compactTokens(totalTokens)} tokens` : "telemetry off"}
          />
          <StatCard
            label="Today's tokens"
            value={cost ? compactTokens(cost.todayTokens) : "—"}
            sub="this calendar day"
          />
          <StatCard
            label="Total tokens"
            value={cost ? compactTokens(totalTokens) : "—"}
            sub="across sessions"
          />
        </div>
      </section>

      <section aria-label="Work done">
        <h3 className="section-label mb-3">Work done</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Files edited" value={String(work.files)} />
          <StatCard label="Tools" value={String(work.tools)} />
          <StatCard label="Commands" value={String(work.commands)} />
          <StatCard label="Subagents" value={String(work.subagents)} />
          <StatCard label="Prompts" value={String(work.prompts)} />
        </div>
      </section>
    </div>
  );
}

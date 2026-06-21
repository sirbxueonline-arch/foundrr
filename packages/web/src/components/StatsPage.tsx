/**
 * StatsPage — an at-a-glance totals board for the whole dev box: how long agents
 * have been running, what they've spent (money + tokens, with a 7-day trend and
 * a per-project breakdown), and how much work they've done.
 *
 * All figures are derived from the live stream the dashboard already holds — the
 * running sessions and the persisted cost snapshot — so it needs no extra
 * endpoint. A local-only daily budget meter and a CSV export of the persisted
 * ledger round it out.
 */
import { useState } from "react";
import type { AgentSession, CostSnapshot } from "@mission-control/shared";
import { usd, compactTokens, uptime } from "../lib/format";
import { exportCostCsv, ApiError } from "../lib/api";
import { BudgetMeter } from "./BudgetMeter";

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

/** First letter of the weekday from a Date.toDateString() label ("Sat …" → "S"). */
function dayInitial(dayLabel: string): string {
  return dayLabel.slice(0, 1);
}

/** A compact 7-day spend bar chart; the most recent day (today) is amber. */
function CostTrend({ history }: { history: CostSnapshot["history"] }) {
  const max = Math.max(...history.map((d) => d.usd), 0);
  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <span className="section-label">Last 7 days</span>
        <span className="mono text-[0.6875rem] tabular-nums" style={{ color: "var(--color-faint)" }}>
          {usd(sum(history.map((d) => d.usd)))} total
        </span>
      </div>
      <div className="flex h-24 items-end gap-1.5">
        {history.map((d, i) => {
          const today = i === history.length - 1;
          const h = max > 0 ? Math.max(2, (d.usd / max) * 100) : 2;
          return (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-1 items-end" title={`${d.day}: ${usd(d.usd)}`}>
                <div
                  className="w-full rounded-sm transition-all"
                  style={{
                    height: `${h}%`,
                    backgroundColor: today
                      ? "var(--color-signal)"
                      : "color-mix(in srgb, var(--color-text) 22%, transparent)",
                  }}
                />
              </div>
              <span
                className="mono text-[0.5625rem]"
                style={{ color: today ? "var(--color-signal-ink)" : "var(--color-faint)" }}
              >
                {dayInitial(d.day)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ProjectRow {
  project: string;
  usd: number;
  tokens: number;
}

/** Roll today's per-session spend up to per-project, top 6 by USD. */
function projectSpend(sessions: AgentSession[], cost: CostSnapshot | null): ProjectRow[] {
  if (!cost) return [];
  const byProject = new Map<string, ProjectRow>();
  for (const s of sessions) {
    const c = cost.sessions[s.sessionId];
    if (!c || (c.usd === 0 && c.tokens === 0)) continue;
    const prev = byProject.get(s.project) ?? { project: s.project, usd: 0, tokens: 0 };
    byProject.set(s.project, {
      project: s.project,
      usd: prev.usd + c.usd,
      tokens: prev.tokens + c.tokens,
    });
  }
  return [...byProject.values()].sort((a, b) => b.usd - a.usd).slice(0, 6);
}

/** Pull the persisted cost ledger down as a CSV; surfaces failures inline. */
function ExportButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onExport = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await exportCostCsv();
    } catch (e) {
      setError(e instanceof ApiError ? `export failed (${e.status})` : "export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      {error ? (
        <span className="mono text-[0.625rem]" role="alert" style={{ color: "var(--color-alert)" }}>
          {error}
        </span>
      ) : null}
      <button type="button" onClick={() => void onExport()} disabled={busy} className="pill pill-cool">
        {busy ? "EXPORTING…" : "EXPORT CSV"}
      </button>
    </span>
  );
}

interface PlanTier {
  name: string;
  price: string;
  blurb: string;
}

/** Where the "Get Pro / Team" CTAs point until in-app billing exists. */
const PRICING_URL = "https://foundrr.online/pricing";

const UPGRADE_TIERS: ReadonlyArray<PlanTier> = [
  {
    name: "Pro",
    price: "$7/mo",
    blurb: "A reliable leash, cloud history sync across devices, and multi-machine dashboards.",
  },
  {
    name: "Team",
    price: "$15/seat",
    blurb: "An approval audit log, roles, SSO, and policy controls for your whole team.",
  },
];

function PlanCard({ tier }: { tier: PlanTier }) {
  return (
    <div className="panel flex flex-col gap-2 p-5">
      <div className="flex items-baseline gap-2">
        <span className="text-base font-medium" style={{ color: "var(--color-text)" }}>
          {tier.name}
        </span>
        <span className="mono text-xs" style={{ color: "var(--color-muted)" }}>
          {tier.price}
        </span>
      </div>
      <p className="text-[0.8125rem] leading-relaxed" style={{ color: "var(--color-muted)" }}>
        {tier.blurb}
      </p>
      <a
        href={PRICING_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="btn-primary mt-2 self-start"
      >
        Get {tier.name}
      </a>
    </div>
  );
}

/** Cursor-style plan band: two upgrade cards + the current "Local · Free" plan. */
function PlanSection() {
  return (
    <section aria-label="Plan">
      <h3 className="section-label mb-3">Plan</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {UPGRADE_TIERS.map((tier) => (
          <PlanCard key={tier.name} tier={tier} />
        ))}
      </div>
      <div className="panel mt-3 flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-medium" style={{ color: "var(--color-text)" }}>
              Local
            </span>
            <span
              className="mono rounded-full px-2 py-0.5 text-[0.5625rem] uppercase tracking-wider"
              style={{
                color: "var(--color-muted)",
                backgroundColor: "var(--color-inset)",
                border: "1px solid var(--color-line)",
              }}
            >
              Current
            </span>
            <span className="text-xs" style={{ color: "var(--color-faint)" }}>
              · Free
            </span>
          </div>
          <p className="mt-1 text-[0.8125rem]" style={{ color: "var(--color-muted)" }}>
            Everything on this machine — agents, servers, terminal, and the leash. Yours forever.
          </p>
        </div>
      </div>
    </section>
  );
}

export function StatsPage({ sessions, cost, now }: StatsPageProps) {
  const active = sessions.filter((s) => s.status === "active" || s.status === "waiting");
  const ended = sessions.filter((s) => s.status === "ended");

  // Live runtime = combined uptime of every session working right now.
  const liveRuntimeMs = sum(active.map((s) => Math.max(0, now - s.startedAt)));
  const liveRuntime = liveRuntimeMs > 0 ? uptime(now - liveRuntimeMs, now) : "0s";

  // Spend: today's figure + the ALL-TIME totals, both persisted to SQLite.
  const totalUsd = cost?.lifetimeUsd ?? 0;
  const totalTokens = cost?.lifetimeTokens ?? 0;
  const projects = projectSpend(sessions, cost);

  const work = {
    files: sum(sessions.map((s) => s.stats.filesEdited)),
    tools: sum(sessions.map((s) => s.stats.tools)),
    commands: sum(sessions.map((s) => s.stats.commands)),
    subagents: sum(sessions.map((s) => s.stats.subagents)),
    prompts: sum(sessions.map((s) => s.stats.prompts)),
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-1">
      <PlanSection />

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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="section-label">Spend</h3>
          {cost ? <ExportButton /> : null}
        </div>
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

        {cost ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <CostTrend history={cost.history} />
            <div className="panel flex flex-col gap-3 p-4">
              <span className="section-label">Daily budget</span>
              <BudgetMeter todayUsd={cost.todayUsd} />
              <p className="mono text-[0.625rem] leading-relaxed" style={{ color: "var(--color-faint)" }}>
                Local only — a personal guardrail, never sent anywhere.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {projects.length > 0 ? (
        <section aria-label="Spend by project">
          <h3 className="section-label mb-3">By project</h3>
          <div className="panel flex flex-col">
            {projects.map((p, i) => (
              <div
                key={p.project}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
                style={{ borderTop: i === 0 ? undefined : "1px solid var(--color-line)" }}
              >
                <span className="truncate text-sm" style={{ color: "var(--color-text)" }}>
                  {p.project}
                </span>
                <span className="flex shrink-0 items-baseline gap-3">
                  <span className="mono text-xs tabular-nums" style={{ color: "var(--color-faint)" }}>
                    {compactTokens(p.tokens)} tok
                  </span>
                  <span className="mono text-sm tabular-nums" style={{ color: "var(--color-signal-ink)" }}>
                    {usd(p.usd)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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

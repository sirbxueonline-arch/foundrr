"use client";

import { useLiveData, type LiveData } from "@/lib/useLiveData";
import { MODELS, resolveModel } from "@/lib/models";
import { formatCompact, formatInt, formatUsd, relativeTime } from "@/lib/format";
import type { LeaderboardRow } from "@/lib/supabase";

const EMPTY_ROW: Omit<LeaderboardRow, "agent"> = {
  total_tokens: 0,
  input_tokens: 0,
  output_tokens: 0,
  total_cost_usd: 0,
  installs: 0,
  events: 0,
  last_seen: null,
};

// Merge live rows over the canonical top-10 so every model shows, ranked by
// tokens. Unknown agents from the DB are appended after the canonical set.
function buildRows(live: LeaderboardRow[]): LeaderboardRow[] {
  const byAgent = new Map(live.map((r) => [r.agent, r]));
  const canonical: LeaderboardRow[] = MODELS.map(
    (m) => byAgent.get(m.key) ?? { agent: m.key, ...EMPTY_ROW },
  );
  const extras = live.filter((r) => !MODELS.some((m) => m.key === r.agent));
  return [...canonical, ...extras].sort(
    (a, b) => b.total_tokens - a.total_tokens,
  );
}

function CrownIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="text-signal signal-glow-soft drop-shadow"
    >
      <path
        d="M3 7l4.5 3L12 4l4.5 6L21 7l-1.6 11H4.6L3 7z"
        fill="currentColor"
        opacity="0.95"
      />
      <circle cx="3" cy="6" r="1.4" fill="currentColor" />
      <circle cx="12" cy="3" r="1.4" fill="currentColor" />
      <circle cx="21" cy="6" r="1.4" fill="currentColor" />
    </svg>
  );
}

function rankBadgeClasses(rank: number): string {
  if (rank === 1)
    return "bg-[color-mix(in_srgb,var(--signal)_22%,transparent)] text-signal border-[color-mix(in_srgb,var(--signal)_45%,var(--line))]";
  if (rank === 2)
    return "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-text border-line";
  if (rank === 3)
    return "bg-[color-mix(in_srgb,var(--cool)_14%,transparent)] text-cool border-line";
  return "bg-transparent text-faint border-line";
}

function Row({
  row,
  rank,
  maxTokens,
}: {
  row: LeaderboardRow;
  rank: number;
  maxTokens: number;
}) {
  const model = resolveModel(row.agent);
  const isLeader = rank === 1 && row.total_tokens > 0;
  const share = maxTokens > 0 ? (row.total_tokens / maxTokens) * 100 : 0;
  const hasData = row.total_tokens > 0 || row.installs > 0;

  return (
    <li
      className={`card-hover group relative overflow-hidden rounded-xl border px-4 py-3.5 sm:px-5 ${
        isLeader
          ? "border-[color-mix(in_srgb,var(--signal)_45%,var(--line))] bg-[color-mix(in_srgb,var(--signal)_8%,var(--panel))] box-glow-signal"
          : "border-line bg-panel hover:border-[var(--faint)]"
      }`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-semibold tabular-nums ${rankBadgeClasses(
            rank,
          )}`}
        >
          {rank}
        </span>
        <span
          className="h-8 w-1.5 shrink-0 rounded-full"
          style={{
            backgroundColor: model.color,
            boxShadow: isLeader
              ? `0 0 12px color-mix(in srgb, ${model.color} 60%, transparent)`
              : "none",
          }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-text">{model.name}</span>
            {isLeader && <CrownIcon />}
          </div>
          <span className="text-xs text-faint">{model.vendor}</span>
        </div>

        <div className="hidden w-24 shrink-0 flex-col items-end sm:flex">
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-faint">
            installs
          </span>
          <span className="font-mono text-sm text-muted tabular-nums">
            {hasData ? formatInt(row.installs) : "—"}
          </span>
        </div>

        <div className="flex w-20 shrink-0 flex-col items-end sm:w-24">
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-faint">
            cost
          </span>
          <span className="font-mono text-sm text-muted tabular-nums">
            {hasData ? formatUsd(row.total_cost_usd) : "—"}
          </span>
        </div>

        <div className="flex w-24 shrink-0 flex-col items-end sm:w-28">
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-faint">
            tokens
          </span>
          <span
            className={`font-mono text-sm tabular-nums ${
              isLeader ? "text-signal signal-glow-soft" : "text-text"
            }`}
          >
            {hasData ? formatCompact(row.total_tokens) : "—"}
          </span>
        </div>
      </div>

      {/* Share bar */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--line)_70%,transparent)]">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            isLeader ? "bar-shimmer" : ""
          }`}
          style={{
            width: `${Math.max(share, hasData ? 4 : 0)}%`,
            backgroundColor: model.color,
            opacity: isLeader ? 1 : 0.55,
          }}
        />
      </div>
    </li>
  );
}

export function Leaderboard({ initial }: { initial: LiveData }) {
  const { leaderboard } = useLiveData(initial);
  const rows = buildRows(leaderboard);
  const maxTokens = rows[0]?.total_tokens ?? 0;
  const hasAny = rows.some((r) => r.total_tokens > 0);

  const lastSeen =
    leaderboard.length > 0
      ? relativeTime(
          leaderboard
            .map((r) => r.last_seen)
            .filter(Boolean)
            .sort()
            .at(-1) ?? null,
        )
      : "—";

  return (
    <section id="leaderboard" className="mx-auto max-w-4xl px-5 py-20 sm:py-28">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.24em] text-cool">
            // model leaderboard
          </p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-semibold tracking-tight">
            Who is burning the tokens
          </h2>
          <p className="mt-3 max-w-2xl text-muted leading-relaxed">
            Ranked by total tokens metered across every install. The crown goes
            to the busiest agent in the fleet.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="pulse-dot absolute inset-0" aria-hidden />
            <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-signal" />
          </span>
          <span className="font-mono text-[0.7rem] text-muted">
            updated {lastSeen}
          </span>
        </div>
      </header>

      <ol className="flex flex-col gap-2.5" aria-live="polite">
        {rows.slice(0, 10).map((row, i) => (
          <Row key={row.agent} row={row} rank={i + 1} maxTokens={maxTokens} />
        ))}
      </ol>

      {!hasAny && (
        <p className="mt-6 text-center text-sm text-muted">
          No agents reporting yet — the leaderboard fills in as installs come
          online.
        </p>
      )}
    </section>
  );
}

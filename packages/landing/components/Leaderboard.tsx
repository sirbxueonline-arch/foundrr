"use client";

import { useLiveData, type LiveData } from "@/lib/useLiveData";
import { MODELS, resolveModel } from "@/lib/models";
import {
  formatCompact,
  formatInt,
  formatUsd,
  relativeTime,
} from "@/lib/format";
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
  const extras = live.filter(
    (r) => !MODELS.some((m) => m.key === r.agent),
  );
  return [...canonical, ...extras].sort(
    (a, b) => b.total_tokens - a.total_tokens,
  );
}

function CrownIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="text-signal"
    >
      <path
        d="M3 7l4.5 3L12 4l4.5 6L21 7l-1.6 11H4.6L3 7z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
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
      className={`group relative rounded-lg border px-4 py-3.5 sm:px-5 transition-colors ${
        isLeader
          ? "border-[color-mix(in_srgb,var(--signal)_45%,var(--line))] bg-[color-mix(in_srgb,var(--signal)_7%,var(--panel))]"
          : "border-line bg-panel hover:border-[var(--faint)]"
      }`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <span className="font-mono text-sm text-faint w-6 shrink-0 tabular-nums text-right">
          {rank}
        </span>
        <span
          className="h-7 w-1 rounded-full shrink-0"
          style={{ backgroundColor: model.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text truncate">{model.name}</span>
            {isLeader && <CrownIcon />}
          </div>
          <span className="text-xs text-faint">{model.vendor}</span>
        </div>

        <div className="hidden sm:flex flex-col items-end w-24 shrink-0">
          <span className="font-mono text-xs text-faint uppercase tracking-wider">
            installs
          </span>
          <span className="font-mono text-sm text-muted tabular-nums">
            {hasData ? formatInt(row.installs) : "—"}
          </span>
        </div>

        <div className="flex flex-col items-end w-20 sm:w-24 shrink-0">
          <span className="font-mono text-xs text-faint uppercase tracking-wider">
            cost
          </span>
          <span className="font-mono text-sm text-muted tabular-nums">
            {hasData ? formatUsd(row.total_cost_usd) : "—"}
          </span>
        </div>

        <div className="flex flex-col items-end w-24 sm:w-28 shrink-0">
          <span className="font-mono text-xs text-faint uppercase tracking-wider">
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
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--line)_70%,transparent)]">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${share}%`,
            backgroundColor: model.color,
            opacity: isLeader ? 1 : 0.6,
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

  return (
    <section id="leaderboard" className="mx-auto max-w-4xl px-5 py-20 sm:py-28">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-cool mb-2">
          // model leaderboard
        </p>
        <h2 className="font-display text-3xl sm:text-4xl font-semibold">
          Who is burning the tokens
        </h2>
        <p className="mt-2 text-muted max-w-2xl">
          Ranked by total tokens metered across every install. The crown goes to
          the busiest agent in the fleet.
        </p>
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

      <p className="mt-4 text-center font-mono text-xs text-faint">
        last update:{" "}
        {leaderboard.length > 0
          ? relativeTime(
              leaderboard
                .map((r) => r.last_seen)
                .filter(Boolean)
                .sort()
                .at(-1) ?? null,
            )
          : "—"}
      </p>
    </section>
  );
}

"use client";

import { useLiveData, type LiveData } from "@/lib/useLiveData";
import { useCountUp } from "@/lib/useCountUp";
import { formatInt, formatUsd } from "@/lib/format";

function TokenCounter({ value }: { value: number }) {
  const animated = useCountUp(value);
  const groups = formatInt(animated).split(",");
  return (
    <div
      className="font-mono tabular-nums text-signal signal-glow leading-none flex items-baseline justify-center"
      aria-label={`${formatInt(value)} tokens`}
    >
      <span className="flex items-baseline text-[clamp(1.75rem,13cqi,4.75rem)] max-w-full font-semibold tracking-[-0.02em]">
        {groups.map((group, i) => (
          <span key={i} className="flex items-baseline">
            {i > 0 && (
              <span className="text-[var(--faint)] mx-[0.06em] font-normal">
                ,
              </span>
            )}
            {group}
          </span>
        ))}
      </span>
    </div>
  );
}

function DollarCounter({ value }: { value: number }) {
  const animated = useCountUp(value);
  return (
    <div
      className="font-mono tabular-nums text-signal signal-glow leading-none text-[clamp(1.75rem,13cqi,4.75rem)] max-w-full font-semibold tracking-[-0.02em]"
      aria-label={`${formatUsd(value)} total spend`}
    >
      {formatUsd(animated)}
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-[color-mix(in_srgb,var(--panel)_35%,transparent)] px-4 py-5">
      <span className="font-mono text-2xl sm:text-3xl text-text tabular-nums">
        {value}
      </span>
      <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </span>
    </div>
  );
}

export function Counters({ initial }: { initial: LiveData }) {
  const { totals } = useLiveData(initial);
  const isEmpty = totals.events === 0 && totals.installs === 0;

  return (
    <section
      id="counters"
      className="relative border-y border-line bg-[color-mix(in_srgb,var(--panel)_30%,transparent)] py-16 sm:py-24"
    >
      {/* faint corner brackets for the console frame feel */}
      <div className="mx-auto max-w-5xl px-5">
        <div className="mb-12 flex flex-col items-center text-center sm:mb-16">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.24em] text-cool">
            // global telemetry
          </p>
          <h2 className="mt-3 font-display text-3xl sm:text-5xl font-bold tracking-[-0.02em] text-text">
            Every token, metered live
          </h2>
          <p className="mt-4 max-w-xl text-sm sm:text-base text-muted leading-relaxed text-balance">
            Anonymous usage from every install, aggregated in real time. Watch
            the numbers move.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="group @container overflow-hidden flex flex-col items-center gap-5 rounded-2xl border border-line bg-[color-mix(in_srgb,var(--panel)_55%,transparent)] px-6 py-12 text-center transition-colors hover:border-[color-mix(in_srgb,var(--signal)_30%,var(--line))]">
            <Label live={!isEmpty}>Total tokens metered</Label>
            <TokenCounter value={totals.total_tokens} />
          </div>
          <div className="group @container overflow-hidden flex flex-col items-center gap-5 rounded-2xl border border-line bg-[color-mix(in_srgb,var(--panel)_55%,transparent)] px-6 py-12 text-center transition-colors hover:border-[color-mix(in_srgb,var(--signal)_30%,var(--line))]">
            <Label live={!isEmpty}>Total spend tracked</Label>
            <DollarCounter value={totals.total_cost_usd} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 sm:gap-4">
          <SmallStat label="installs" value={formatInt(totals.installs)} />
          <SmallStat label="models" value={formatInt(totals.models)} />
          <SmallStat label="events" value={formatInt(totals.events)} />
        </div>

        {isEmpty && (
          <p className="mt-12 text-center text-sm text-muted">
            Be the first — telemetry is just getting started.
          </p>
        )}
      </div>
    </section>
  );
}

function Label({
  children,
  live,
}: {
  children: React.ReactNode;
  live: boolean;
}) {
  return (
    <div className="flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.22em] text-muted">
      <span className="relative inline-flex h-1.5 w-1.5">
        {live && <span className="pulse-dot absolute inset-0" />}
        <span
          className={`relative inline-block h-1.5 w-1.5 rounded-full ${
            live ? "bg-signal" : "bg-faint"
          }`}
        />
      </span>
      {children}
    </div>
  );
}

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
      <span className="flex items-baseline text-[clamp(2.75rem,11vw,7rem)] font-semibold tracking-tight">
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
      className="font-mono tabular-nums text-signal signal-glow leading-none text-[clamp(2.75rem,11vw,7rem)] font-semibold tracking-tight"
      aria-label={`${formatUsd(value)} total spend`}
    >
      {formatUsd(animated)}
    </div>
  );
}

function SmallStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-mono text-2xl sm:text-3xl text-text tabular-nums">
        {value}
      </span>
      <span className="text-xs uppercase tracking-[0.18em] text-faint">
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
      className="relative border-y border-line bg-[color-mix(in_srgb,var(--panel)_40%,transparent)] py-16 sm:py-24"
    >
      <div className="mx-auto max-w-5xl px-5">
        <div className="grid gap-12 sm:gap-16 sm:grid-cols-2">
          <div className="flex flex-col items-center text-center gap-3">
            <Label live={!isEmpty}>Total tokens metered</Label>
            <TokenCounter value={totals.total_tokens} />
          </div>
          <div className="flex flex-col items-center text-center gap-3">
            <Label live={!isEmpty}>Total spend tracked</Label>
            <DollarCounter value={totals.total_cost_usd} />
          </div>
        </div>

        <div className="mt-14 flex items-center justify-center gap-10 sm:gap-16">
          <SmallStat label="installs" value={formatInt(totals.installs)} />
          <div className="h-10 w-px bg-line" aria-hidden />
          <SmallStat label="models tracked" value={formatInt(totals.models)} />
          <div className="h-10 w-px bg-line" aria-hidden />
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
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted">
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

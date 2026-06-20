"use client";

import { useLiveData, type LiveData } from "@/lib/useLiveData";
import { useCountUp } from "@/lib/useCountUp";
import { formatInt, formatUsd } from "@/lib/format";

// Compact display formats so the oversized numerals stay short and fit their
// column at any scale — "137.8M", "1.3B" instead of "137,764,495" (which
// overflows into the next stat). The exact value is still announced via aria.
const COMPACT_INT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const COMPACT_USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function compactInt(n: number): string {
  return COMPACT_INT.format(Math.max(0, Math.round(n)));
}

function compactUsd(n: number): string {
  const v = Math.max(0, n);
  // Keep cents for everyday amounts; switch to compact ($1.2M) once it's large.
  return v < 100_000 ? `$${v.toFixed(2)}` : COMPACT_USD.format(v);
}

/**
 * Big live telemetry numerals — light canvas, modeled on Aqua's "Results you
 * notice immediately" stat band. Each oversized JetBrains Mono number is ink on
 * off-white and sits over a full-width hairline rule, with a tiny caption pushed
 * to the right end of that rule (number left, caption right, on the underline
 * row) — exactly Aqua's treatment. Data is real: it reads live global_totals
 * through useLiveData.
 */
function LiveStat({
  value,
  caption,
  note,
  ariaLabel,
  live,
}: {
  value: string;
  caption: string;
  note: string;
  ariaLabel: string;
  live: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span
        className="font-mono text-[clamp(2.25rem,9vw,5rem)] font-light leading-none tracking-[-0.03em] tabular-nums text-ink"
        aria-label={ariaLabel}
      >
        {value}
      </span>
      {/* Full-width hairline rule; caption left, short note pushed right —
          Aqua's exact stat-row treatment ("6h 23m" … "Saved coding weekly"). */}
      <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-hairline pt-3">
        <span className="inline-flex items-center gap-2 font-mono text-[0.66rem] uppercase tracking-[0.18em] text-ink-faint">
          {live && (
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="pulse-dot absolute inset-0" aria-hidden />
              <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-signal" />
            </span>
          )}
          {caption}
        </span>
        <span className="shrink-0 text-right text-[0.78rem] text-ink-muted">
          {note}
        </span>
      </div>
    </div>
  );
}

export function Counters({ initial }: { initial: LiveData }) {
  const { totals } = useLiveData(initial);
  const animatedTokens = useCountUp(totals.total_tokens);
  const animatedCost = useCountUp(totals.total_cost_usd);
  const live = totals.events > 0 || totals.installs > 0;

  return (
    <div className="grid gap-12 sm:grid-cols-2">
      <LiveStat
        value={compactInt(animatedTokens)}
        caption="total tokens metered"
        note="across every install"
        ariaLabel={`${formatInt(totals.total_tokens)} tokens metered`}
        live={live}
      />
      <LiveStat
        value={compactUsd(animatedCost)}
        caption="total spend tracked"
        note="anonymous, in real time"
        ariaLabel={`${formatUsd(totals.total_cost_usd)} total spend`}
        live={live}
      />
    </div>
  );
}

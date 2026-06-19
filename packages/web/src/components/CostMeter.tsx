/**
 * CostMeter — a compact telemetry readout of today's spend: "$ today" prominent
 * in --signal, with today's token count muted beside it. Lives in the Header on
 * desktop and stays legible on mobile.
 *
 * Honest off-state: when `cost` is null OR there's been zero spend and zero
 * tokens today, we show "$0.0000" in --faint with a hint that telemetry isn't
 * running (no faked numbers).
 *
 * Numbers use mono + tabular-nums so live ticks never shift the layout. The
 * readout is a polite live region so screen readers hear updates without spam.
 */
import type { CostSnapshot } from "@mission-control/shared";
import { usd, compactTokens } from "../lib/format";

interface CostMeterProps {
  cost: CostSnapshot | null;
}

const OFF_HINT = "telemetry off — run `mc telemetry enable`";

export function CostMeter({ cost }: CostMeterProps) {
  const isOff = cost === null || (cost.todayUsd === 0 && cost.todayTokens === 0);

  if (isOff) {
    return (
      <div
        className="flex shrink-0 items-baseline gap-2"
        role="status"
        aria-live="polite"
        title={OFF_HINT}
        aria-label={`Cost today ${usd(0)}. ${OFF_HINT}`}
      >
        <span
          className="mono text-sm tabular-nums"
          style={{ color: "var(--color-faint)" }}
        >
          {usd(0)}
        </span>
        <span className="caption hidden sm:inline">telemetry off</span>
      </div>
    );
  }

  return (
    <div
      className="flex shrink-0 items-baseline gap-2"
      role="status"
      aria-live="polite"
      aria-label={`${usd(cost.todayUsd)} today, ${compactTokens(cost.todayTokens)} tokens`}
    >
      <span
        className="mono text-sm font-semibold tabular-nums"
        style={{ color: "var(--color-signal)" }}
      >
        {usd(cost.todayUsd)}
      </span>
      {/* Token count is secondary — drop it on mobile so the $ figure never clips. */}
      <span
        className="mono hidden text-xs tabular-nums sm:inline"
        style={{ color: "var(--color-muted)" }}
      >
        {compactTokens(cost.todayTokens)} tok
      </span>
      <span className="caption hidden sm:inline">today</span>
    </div>
  );
}

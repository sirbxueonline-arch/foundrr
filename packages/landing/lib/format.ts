// Display formatting helpers. Numbers use grouped digits in mono.

const COMPACT_THRESHOLD = 1_000_000;

export function formatInt(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

// Compact form for very large token counts, e.g. 12.3M / 4.1B.
export function formatCompact(value: number): string {
  if (value < COMPACT_THRESHOLD) return formatInt(value);
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return `${(value / 1_000_000_000).toFixed(1)}B`;
}

export function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Split an integer into thousands groups so each group can be styled.
export function groupDigits(value: number): string[] {
  return formatInt(value).split(",");
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffMs = Date.now() - then;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

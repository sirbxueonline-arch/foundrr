/**
 * Small, pure formatting helpers for the telemetry UI. No external deps.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compact relative time from an epoch-ms timestamp to now.
 * e.g. "now", "3s", "2m", "1h", "4d". Future timestamps clamp to "now".
 */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const delta = now - ts;
  if (!Number.isFinite(delta) || delta < SECOND) return "now";
  if (delta < MINUTE) return `${Math.floor(delta / SECOND)}s`;
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`;
  return `${Math.floor(delta / DAY)}d`;
}

/**
 * Elapsed wall-clock duration since `from` (epoch ms), as a compact string.
 * e.g. "12s", "3m", "1h04m", "2d03h".
 */
export function uptime(from: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - from);
  if (delta < MINUTE) return `${Math.floor(delta / SECOND)}s`;
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m`;
  if (delta < DAY) {
    const h = Math.floor(delta / HOUR);
    const m = Math.floor((delta % HOUR) / MINUTE);
    return `${h}h${String(m).padStart(2, "0")}m`;
  }
  const d = Math.floor(delta / DAY);
  const h = Math.floor((delta % DAY) / HOUR);
  return `${d}d${String(h).padStart(2, "0")}h`;
}

/**
 * Truncate a string to `n` chars, appending an ellipsis when cut.
 * Keeps the tail of file-path-like strings readable by truncating the middle
 * when the string clearly looks like a path.
 */
export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  if (n <= 1) return s.slice(0, n);
  return `${s.slice(0, n - 1)}…`;
}

/**
 * Make a filesystem path compact and legible for a header line: collapse the
 * home dir to `~`, and for deep paths keep only the most informative trailing
 * segments behind a leading ellipsis (VS-Code-style). The tail is what tells you
 * *which project* this is, so it's preserved over the root.
 * e.g. "/Users/kaan/Desktop/dev dash" → "~/Desktop/dev dash"
 *      "/Users/kaan/work/acme/apps/web/src" → "…/apps/web/src"
 */
export function shortPath(path: string, maxSegments = 3): string {
  if (!path) return "";
  const home = path.replace(/^\/(?:Users|home)\/[^/]+/, "~");
  const segments = home.split("/").filter(Boolean);
  if (segments.length <= maxSegments) {
    return home.startsWith("~") ? home : `/${segments.join("/")}`;
  }
  return `…/${segments.slice(-maxSegments).join("/")}`;
}

const USD_SMALL_THRESHOLD = 1;
const USD_SMALL_DECIMALS = 4;
const USD_LARGE_DECIMALS = 2;
const THOUSAND = 1000;
const MILLION = 1_000_000;

/**
 * Format a USD amount for telemetry display. Small amounts keep more precision
 * so sub-cent costs stay legible: `< $1` → 4 decimals (e.g. "$0.0123"), else 2
 * (e.g. "$12.34"). Non-finite or negative input clamps to "$0.0000".
 */
export function usd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) {
    return `$${(0).toFixed(USD_SMALL_DECIMALS)}`;
  }
  const decimals = n < USD_SMALL_THRESHOLD ? USD_SMALL_DECIMALS : USD_LARGE_DECIMALS;
  return `$${n.toFixed(decimals)}`;
}

/**
 * Compact a token count: "812", "4.1k", "1.2M". Values under 1k render whole;
 * thousands and millions get one decimal (trailing ".0" trimmed). Non-finite
 * or negative input renders "0".
 */
export function compactTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < THOUSAND) return String(Math.round(n));
  if (n < MILLION) return `${trimZero(n / THOUSAND)}k`;
  return `${trimZero(n / MILLION)}M`;
}

/** One-decimal string with a trailing ".0" removed, e.g. 4.0 → "4", 4.1 → "4.1". */
function trimZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

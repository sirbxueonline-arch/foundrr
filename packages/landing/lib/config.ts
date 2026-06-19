// Public config with literal defaults so the page works with no env set.

export const GITHUB_URL =
  process.env.NEXT_PUBLIC_GITHUB_URL ||
  "https://github.com/kaanguluzada/mission-control";

// Server-side revalidation window (seconds) and client poll interval (ms).
export const SERVER_REVALIDATE_SECONDS = 30;
export const CLIENT_POLL_MS = 15_000;

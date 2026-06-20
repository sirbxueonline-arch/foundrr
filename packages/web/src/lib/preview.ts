/**
 * Preview URLs — the preview proxy is now PATH-MOUNTED on the main daemon port
 * under `/__preview/:port/`, sharing the dashboard's own origin.
 *
 * Because the preview lives on the SAME origin as the dashboard, it inherits the
 * dashboard's protocol + host automatically:
 *   - LAN  http://lan-ip:7878  → preview http://lan-ip:7878/__preview/<port>/
 *   - https tunnel             → preview https://<domain>/__preview/<port>/
 * No separate port to forward, and no http-on-https mixed content. So a preview
 * is reachable in every normal context the dashboard itself is reachable in —
 * which is why there is no longer a reachability check or a "LAN only" state.
 *
 * This helper reads `window.location` defensively and never throws, so it is
 * safe to call inside render and inside click handlers alike.
 */
import { getToken } from "./token";

/**
 * The same-origin preview URL for a dev-server `port`: the page's own
 * protocol+host plus the `/__preview/<port>/` path. Defensive: falls back to a
 * relative path if `window` is unavailable (SSR/tests), which still resolves
 * against whatever origin loads it.
 */
export function previewUrl(port: number): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  return `${origin}/__preview/${port}/`;
}

/**
 * The URL to actually OPEN a preview in a new tab: the clean preview URL plus a
 * one-time `?token=` so the very first navigation authenticates. The daemon
 * immediately swaps that query token for a path-scoped cookie and redirects to
 * the clean URL (so the previewed page's sub-resources stay authenticated and
 * the token doesn't linger in the address bar). Falls back to the clean URL
 * when no token is available. Use `previewUrl()` for DISPLAY (no token leak).
 */
export function previewOpenUrl(port: number): string {
  const base = previewUrl(port);
  const token = getToken();
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

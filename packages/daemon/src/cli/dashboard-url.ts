/**
 * Build dashboard URLs with the access token appended as `?token=...`.
 *
 * Shared by the URL banner (server), `mc tunnel`, and `mc rotate-token` so the
 * exact query-string shape lives in one place.
 */

/** A local dashboard URL: `http://<host>:<port>/?token=<token>`. */
export function localDashboardUrl(host: string, port: number, token: string): string {
  // 0.0.0.0 is a bind address, not a reachable host — show loopback instead.
  const shown = host === "0.0.0.0" ? "127.0.0.1" : host;
  return `http://${shown}:${port}/?token=${token}`;
}

/**
 * Append the access token to an externally-assigned base origin (e.g. a tunnel
 * URL like `https://foo.trycloudflare.com`). Trailing slashes are normalized.
 */
export function tokenizedUrl(baseOrigin: string, token: string): string {
  const trimmed = baseOrigin.replace(/\/+$/, "");
  return `${trimmed}/?token=${token}`;
}

/**
 * `mc rotate-token` — regenerate `<home>/token` with a fresh 32-byte hex token
 * and print the new dashboard URL.
 *
 * Use this to REVOKE an exposed token: a token that leaked (via a public tunnel
 * URL, browser history, a referrer header, a screenshot) is dead the moment you
 * rotate. Any open dashboard tab loses access on its next request and must be
 * reopened with the new `?token=` URL. Restart `mc start` so the daemon picks
 * up the new token.
 *
 * Note: `$MC_TOKEN`, if set, overrides the token file at startup — so rotating
 * the file has no effect while that env var is forcing a fixed token. We warn
 * when that is the case.
 */
import { resolveHome, rotateToken } from "../config.js";
import { DEFAULT_HOST, DEFAULT_PORT } from "../constants.js";
import { localDashboardUrl } from "./dashboard-url.js";
import { color, dim, ok, warn } from "./util.js";

function resolvedPort(): number {
  const raw = process.env["PORT"];
  if (!raw) {
    return DEFAULT_PORT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed <= 0 || parsed > 65535
    ? DEFAULT_PORT
    : parsed;
}

function resolvedHost(): string {
  const raw = process.env["HOST"];
  return raw && raw.trim().length > 0 ? raw.trim() : DEFAULT_HOST;
}

export function runRotateToken(): void {
  process.stdout.write(`\n${color.bold("Mission Control — rotate-token")}\n\n`);

  const home = resolveHome();
  let token: string;
  try {
    token = rotateToken(home);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`failed to write new token to ${home}/token: ${msg}`);
  }

  ok(`Wrote a new access token to ${home}/token (mode 0600).`);

  const url = localDashboardUrl(resolvedHost(), resolvedPort(), token);
  process.stdout.write(`\n  ${color.bold("New dashboard URL:")} ${color.cyan(url)}\n\n`);

  if (process.env["MC_TOKEN"]?.trim()) {
    warn(
      "$MC_TOKEN is set — it overrides the token file at startup, so this " +
        "rotation has no effect until you unset it.",
    );
  }

  dim("The old token is now revoked. Restart `mc start` to apply, then reopen");
  dim("the dashboard with the URL above. Re-link Telegram if you use the leash.");
  process.stdout.write("\n");
}

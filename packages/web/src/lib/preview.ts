/**
 * Preview reachability — can an HTTP preview proxy actually open from the
 * browser context the dashboard is currently being viewed in?
 *
 * The preview feature exposes the dev server through a reverse proxy bound on
 * `0.0.0.0:<proxyPort>`. That proxy speaks PLAIN HTTP (no TLS), and the port is
 * only reachable by devices on the same LAN as the dev box. Two contexts make
 * the preview unreachable, so we must detect them up front rather than stranding
 * a tab on about:blank:
 *
 *   1. HTTPS dashboard → an `http://…` preview is mixed content and the browser
 *      blocks it. (A *.trycloudflare.com tunnel or a custom domain is HTTPS.)
 *   2. Remote dashboard host → the viewer isn't on the dev box's LAN, so the
 *      `0.0.0.0:<proxyPort>` port isn't routable from where they are.
 *
 * When either holds we keep the proxy exposed (the URL is still useful on the
 * LAN) but we tell the user the truth instead of opening a dead tab.
 *
 * Everything here reads `window.location` defensively and never throws, so it
 * is safe to call inside render and inside click handlers alike.
 */

/** Hosts that are unambiguously this very machine. */
const LOOPBACK_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];

/**
 * Whether a hostname is a private-LAN IPv4 literal — the only remote hosts from
 * which the dev box's `0.0.0.0:<proxyPort>` port is actually reachable:
 *   - 10.0.0.0/8
 *   - 172.16.0.0/12  (172.16. … 172.31.)
 *   - 192.168.0.0/16
 *   - 169.254.0.0/16 (link-local)
 *
 * A `*.local` mDNS name or a routable public host is treated as remote (false),
 * because we can't prove it shares the LAN and TLS/mixed-content is the more
 * common failure there anyway.
 */
function isPrivateLanIpv4(hostname: string): boolean {
  const octets = hostname.split(".");
  if (octets.length !== 4) return false;

  const nums = octets.map((o) => Number(o));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;

  const [a, b] = nums as [number, number, number, number];
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/** Whether the dashboard host is local or on a private LAN (preview-reachable). */
function isLocalOrLanHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (LOOPBACK_HOSTS.includes(host)) return true;
  return isPrivateLanIpv4(host);
}

/**
 * The proxy serves PLAIN HTTP and has no TLS, so the preview URL must ALWAYS be
 * `http://<hostname>:<proxyPort>/` — never `https`, regardless of how the
 * dashboard itself is being served. Built from the browser's current hostname
 * (never the literal "localhost") so it targets the dev box, not the viewer's
 * own device. Defensive: falls back to "localhost" if `window` is unavailable.
 */
export function previewUrl(proxyPort: number): string {
  const hostname =
    typeof window !== "undefined" && window.location?.hostname
      ? window.location.hostname
      : "localhost";
  return `http://${hostname}:${proxyPort}/`;
}

/** Result of {@link checkPreviewReachable}. */
export interface PreviewReachability {
  /** True when an http preview can actually open from this context. */
  reachable: boolean;
  /** Why it can't open, when `reachable` is false (else undefined). */
  reason?: "mixed-content" | "remote-host";
}

/**
 * Decide whether the HTTP preview proxy can open from the current browser
 * context. Unreachable when the dashboard is served over HTTPS (mixed content)
 * or from a host that isn't localhost / a private-LAN IP (remote). Defensive:
 * if `window.location` is somehow unreadable, we assume reachable so the normal
 * pre-open→navigate path still runs.
 */
export function checkPreviewReachable(): PreviewReachability {
  if (typeof window === "undefined" || !window.location) {
    return { reachable: true };
  }

  const { protocol, hostname } = window.location;

  // An http:// preview can't be opened from an https:// page (mixed content).
  if (protocol === "https:") {
    return { reachable: false, reason: "mixed-content" };
  }

  // Remote host (tunnel / domain / public IP) → the LAN-only proxy port is
  // unroutable from where the viewer is.
  if (!isLocalOrLanHost(hostname)) {
    return { reachable: false, reason: "remote-host" };
  }

  return { reachable: true };
}

/**
 * The honest, user-facing explanation shown on a server row when Preview can't
 * open from the current context — instead of a blank tab. Names the proxy port
 * and the LAN entry point so the user knows exactly what to do.
 */
export function previewUnreachableMessage(proxyPort: number): string {
  return (
    `Preview runs a local port (:${proxyPort}) reachable only on the same Wi-Fi ` +
    `as this machine, over HTTP — it can't open through an HTTPS/remote link. ` +
    `Open Founder at http://<lan-ip>:7878 on the same network to preview.`
  );
}

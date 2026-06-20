/**
 * Heuristics for deciding whether a detected server is worth offering OPEN /
 * PREVIEW for.
 *
 * macOS (and other OSes) run plenty of background processes that happen to
 * listen on a TCP port but serve nothing a browser can render — ControlCenter,
 * Spotify, rapportd, the Logitech G HUB, etc. Offering "Open" / "Preview" for
 * those just produces a blank tab and a confused founder. We still allow STOP
 * on anything, but only surface browser affordances for things that actually
 * look like a web server.
 *
 * The signal is deliberately simple: a known web framework name, a normal
 * localhost web port, OR a command that looks like a dev server — and an
 * explicit deny-list for the obvious non-web system services so we never offer
 * preview for them even if they grab a "web-ish" port.
 */
import type { ServerEntry } from "../components/ServerRow";

/** Framework names (lowercased substrings) that clearly render in a browser. */
const WEB_FRAMEWORK_HINTS: readonly string[] = [
  "vite",
  "next",
  "react",
  "remix",
  "astro",
  "svelte",
  "vue",
  "nuxt",
  "angular",
  "gatsby",
  "solid",
  "qwik",
  "webpack",
  "parcel",
  "express",
  "fastify",
  "koa",
  "nest",
  "hapi",
  "django",
  "flask",
  "fastapi",
  "uvicorn",
  "gunicorn",
  "rails",
  "sinatra",
  "laravel",
  "php",
  "node",
  "deno",
  "bun",
  "http",
  "static",
  "storybook",
  "docusaurus",
  "vitepress",
];

/**
 * Command / framework substrings for background services that listen on a port
 * but are NOT web servers. These win over every other signal.
 */
const NON_WEB_SERVICE_HINTS: readonly string[] = [
  "controlcenter",
  "control center",
  "spotify",
  "rapportd",
  "lghub",
  "lghub_agent",
  "logioptionsplus",
  "logi",
  "airplay",
  "sharingd",
  "rapport",
  "bluetoothd",
  "mdnsresponder",
  "cloudd",
  "identityservicesd",
  "trustd",
];

/**
 * Common localhost dev/web ports. Anything in 3000–3999, 4000–4999, 5000–5999,
 * 8000–8999, plus a few classics, reads as a web port. System services tend to
 * grab high ephemeral ports or low privileged ones, which fall outside this.
 */
function isLikelyWebPort(port: number): boolean {
  if (port === 80 || port === 443 || port === 8080 || port === 8888) return true;
  if (port >= 3000 && port <= 3999) return true;
  if (port >= 4000 && port <= 4999) return true;
  if (port >= 5000 && port <= 5999) return true;
  if (port >= 8000 && port <= 8999) return true;
  if (port >= 9000 && port <= 9099) return true;
  return false;
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/**
 * Whether to offer OPEN / PREVIEW for this server entry.
 *
 *  - Registered servers are always web-previewable: the user deliberately
 *    registered them as a launch recipe, so we trust that intent.
 *  - Otherwise we require a positive web signal (framework, port, or command)
 *    and no match against the non-web service deny-list.
 */
export function isWebServer(entry: ServerEntry): boolean {
  // A registered recipe is opt-in by the user — always treat it as web.
  if (entry.registered) return true;

  const detected = entry.detected;
  if (!detected) return false;

  const framework = (detected.framework ?? "").toLowerCase();
  const command = (detected.command ?? "").toLowerCase();
  const haystack = `${framework} ${command}`;

  // Explicit non-web services never get browser affordances.
  if (includesAny(haystack, NON_WEB_SERVICE_HINTS)) return false;

  if (includesAny(framework, WEB_FRAMEWORK_HINTS)) return true;
  if (isLikelyWebPort(detected.port)) return true;
  if (includesAny(command, WEB_FRAMEWORK_HINTS)) return true;

  return false;
}

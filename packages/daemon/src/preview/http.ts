/**
 * Path-mounted preview HTTP proxy, wired as an early `onRequest` hook on the
 * Fastify app.
 *
 * Why a hook and not a route: Fastify parses the request body BEFORE the route
 * handler / preHandler runs, which would consume the raw stream we need to hand,
 * untouched, to http-proxy. `onRequest` fires before parsing, so we authenticate
 * and hijack there — http-proxy then streams the pristine `req.raw`.
 *
 * AUTH: the same dashboard token gate as the rest of the API (?token= /
 * x-mc-token / Bearer). An unauthenticated preview request is 401'd, so the
 * proxy is never an open relay. WS upgrades for this path are authenticated and
 * proxied separately (preview/upgrade.ts).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AppContext } from "../http/context.js";
import { extractToken, isValidToken, TOKEN_COOKIE } from "../http/auth.js";
import { parsePreviewUrl } from "./path.js";

const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_FOUND = 302;

/** The literal `?token=` value on this request, if any (before cookie/header). */
function queryToken(req: FastifyRequest): string | undefined {
  const query = req.query as Record<string, unknown> | undefined;
  const value = query?.["token"];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Drop the `token` parameter from a raw URL, preserving the rest of the query. */
function stripTokenParam(rawUrl: string): string {
  const queryAt = rawUrl.indexOf("?");
  if (queryAt === -1) return rawUrl;
  const path = rawUrl.slice(0, queryAt);
  const params = new URLSearchParams(rawUrl.slice(queryAt + 1));
  params.delete("token");
  const rest = params.toString();
  return rest.length > 0 ? `${path}?${rest}` : path;
}

/**
 * If `referer` points at a preview page (`…/__preview/<port>/…`), return that
 * port. Used to route a root-absolute sub-resource a dev server requests at
 * RUNTIME (`/@react-refresh`, `/node_modules/.vite/…`, `/src/App.jsx`, `fetch`)
 * back to the dev server that asked for it — those URLs resolve against the
 * origin root and bypass `<base>`, so the page itself is our only routing clue.
 * Returns null for any non-preview / missing referer (an ordinary request).
 */
function previewPortFromReferer(referer: string | string[] | undefined): number | null {
  const value = Array.isArray(referer) ? referer[0] : referer;
  if (!value) return null;
  try {
    const match = /^\/__preview\/(\d+)(?:\/|$)/.exec(new URL(value).pathname);
    return match ? Number.parseInt(match[1] as string, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Paths that belong to the DASHBOARD itself and must never be Referer-routed to
 * a previewed dev server, even when the request carries a preview Referer (e.g.
 * a `fetch('/api/…')` or the OTLP receiver issued from an open preview tab). The
 * Referer fallback is only for a dev server's own runtime assets (`/@vite/…`,
 * `/node_modules/…`, `/src/…`), never these reserved endpoints.
 */
function isReservedDashboardPath(rawUrl: string): boolean {
  const path = (rawUrl.split("?")[0] ?? "").toLowerCase();
  return (
    path === "/" ||
    path === "/favicon.ico" ||
    path.startsWith("/api/") ||
    path.startsWith("/v1/") || // OTLP telemetry receiver
    path.startsWith("/assets/") ||
    path.startsWith("/stream") ||
    path.startsWith("/term") ||
    path.startsWith("/__preview/")
  );
}

/**
 * Register the preview HTTP proxy hook. Requests under `/__preview/:port/…` are
 * authenticated, then their `/__preview/:port` prefix is stripped and the raw
 * req/res handed to the per-target proxy (which rewrites HTML so assets resolve
 * under the prefix). All other requests fall through untouched.
 */
export function registerPreviewHttp(app: FastifyInstance, ctx: AppContext): void {
  app.addHook("onRequest", (req: FastifyRequest, reply: FastifyReply, done) => {
    const target = parsePreviewUrl(req.url ?? "");
    if (!target) {
      // Not a `/__preview/…` URL — but it may be a root-absolute sub-resource a
      // previewed dev server built at runtime (those bypass <base>). If the
      // Referer is a preview page, proxy this request to that dev server;
      // otherwise it's an ordinary dashboard request — hand it back untouched.
      const referredPort = previewPortFromReferer(req.headers["referer"]);
      if (referredPort === null || isReservedDashboardPath(req.url ?? "")) {
        // Not a preview-origin request, or a genuine dashboard endpoint that
        // merely has a preview tab as its Referer — let normal handling answer.
        done();
        return;
      }
      if (!isValidToken(extractToken(req), ctx.config.token)) {
        reply.code(HTTP_UNAUTHORIZED).send({ error: "unauthorized" });
        return;
      }
      if (!ctx.previewProxy.isExposed(referredPort)) {
        done(); // exposed elsewhere/torn down — let normal handling answer it
        return;
      }
      reply.hijack();
      ctx.previewProxy.handleHttp(referredPort, req.url ?? "/", req.raw, reply.raw);
      return;
    }

    // Same token gate as the dashboard — preview is not an open relay.
    if (!isValidToken(extractToken(req), ctx.config.token)) {
      reply.code(HTTP_UNAUTHORIZED).send({ error: "unauthorized" });
      return;
    }

    // The previewed page fetches its OWN sub-resources (`/__preview/<port>/…`)
    // with no `?token=` — so when this navigation carries a valid query token,
    // convert it into a path-scoped cookie and redirect to the clean URL. Every
    // subsequent proxied request (assets, HMR ws) then authenticates by cookie,
    // and the token no longer lingers in the preview's address bar.
    const fromQuery = queryToken(req);
    if (fromQuery && isValidToken(fromQuery, ctx.config.token)) {
      // Path=/ (not just /__preview/) so the cookie is also sent for the
      // root-absolute sub-resources a dev server requests at runtime, which the
      // Referer-routing branch above proxies back to the right preview. Add
      // `Secure` over an HTTPS tunnel so the token cookie can't go out in clear.
      const proto = (
        Array.isArray(req.headers["x-forwarded-proto"])
          ? req.headers["x-forwarded-proto"][0]
          : req.headers["x-forwarded-proto"]
      )?.split(",")[0]?.trim();
      const isHttps = proto === "https" || req.protocol === "https";
      const cookie =
        `${TOKEN_COOKIE}=${encodeURIComponent(fromQuery)}; ` +
        `Path=/; HttpOnly; SameSite=Lax${isHttps ? "; Secure" : ""}`;
      reply
        .code(HTTP_FOUND)
        .header("set-cookie", cookie)
        .header("location", stripTokenParam(req.url ?? ""))
        .send();
      return;
    }

    if (!ctx.previewProxy.isExposed(target.port)) {
      reply.code(HTTP_NOT_FOUND).send({ error: `port :${target.port} is not exposed` });
      return;
    }

    // Detach from Fastify: http-proxy owns the raw socket from here on (no body
    // parsing, no serialization). The prefix is already stripped into `rest`.
    reply.hijack();
    ctx.previewProxy.handleHttp(target.port, target.rest, req.raw, reply.raw);
  });
}

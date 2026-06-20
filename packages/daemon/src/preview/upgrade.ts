/**
 * Wire preview WebSocket upgrades (Vite HMR, etc.) into the daemon's single HTTP
 * server WITHOUT breaking the dashboard's own WS routes (/stream, /term).
 *
 * @fastify/websocket installs its own `upgrade` listener on `app.server` that
 * dispatches every upgrade through the Fastify router. A `/__preview/…` upgrade
 * has no matching WS route, so letting that listener see it would strand/destroy
 * the socket. We therefore take over: capture the existing `upgrade` listeners,
 * remove them, and install ONE dispatcher that:
 *
 *   - proxies `/__preview/:port/…` upgrades to the dev server (after auth), and
 *   - delegates EVERYTHING ELSE back to the original listeners unchanged, so the
 *     dashboard's /stream and /term keep working exactly as before.
 *
 * Must run AFTER @fastify/websocket has registered (i.e. after buildApp), so the
 * listeners we capture include Fastify's.
 */
import { type IncomingMessage, type Server } from "node:http";
import { type Socket } from "node:net";

import type { Config } from "../config.js";
import { isValidToken, tokenFromCookie } from "../http/auth.js";
import { parsePreviewUrl } from "./path.js";
import type { PreviewProxyService } from "./proxy-service.js";

type UpgradeListener = (req: IncomingMessage, socket: Socket, head: Buffer) => void;

/**
 * Extract the access token from a raw upgrade request (no Fastify wrapper yet):
 * ?token= query, x-mc-token header, or Authorization: Bearer. Mirrors
 * http/auth.ts extractToken, which only sees the Fastify request.
 */
function tokenFromRaw(req: IncomingMessage): string | undefined {
  const url = req.url ?? "";
  const queryAt = url.indexOf("?");
  if (queryAt !== -1) {
    const params = new URLSearchParams(url.slice(queryAt + 1));
    const fromQuery = params.get("token");
    if (fromQuery && fromQuery.length > 0) {
      return fromQuery;
    }
  }

  const headerToken = req.headers["x-mc-token"];
  if (typeof headerToken === "string" && headerToken.length > 0) {
    return headerToken;
  }

  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    const bearer = auth.slice("Bearer ".length).trim();
    if (bearer.length > 0) {
      return bearer;
    }
  }

  // Cookie fallback — the preview page's HMR socket carries the mc_token cookie
  // (set on the first authenticated navigation) but no `?token=` query.
  const cookie = req.headers["cookie"];
  return typeof cookie === "string" ? tokenFromCookie(cookie) : undefined;
}

function destroyQuietly(socket: Socket): void {
  try {
    socket.destroy();
  } catch {
    // Already gone.
  }
}

/** Reject an unauthenticated upgrade with a 401 then close the socket. */
function rejectUnauthorized(socket: Socket): void {
  try {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
  } catch {
    // Socket already gone.
  }
  destroyQuietly(socket);
}

/**
 * Install the preview upgrade dispatcher on the daemon's HTTP server. Preview
 * upgrades are authenticated with the dashboard token (so the preview WS is not
 * an open relay), then proxied; all other upgrades go to the original listeners.
 */
export function wirePreviewUpgrades(
  server: Server,
  previewProxy: PreviewProxyService,
  config: Config,
): void {
  // Capture and detach the listeners already registered (notably Fastify's), so
  // OUR dispatcher decides who handles each upgrade.
  const priorListeners = server.listeners("upgrade") as UpgradeListener[];
  server.removeAllListeners("upgrade");

  const dispatch: UpgradeListener = (req, socket, head) => {
    const target = parsePreviewUrl(req.url ?? "");
    if (!target) {
      // Not a preview path — hand back to the dashboard's own WS handling.
      for (const listener of priorListeners) {
        listener(req, socket, head);
      }
      return;
    }

    // Preview upgrade: enforce the SAME token gate as the dashboard.
    if (!isValidToken(tokenFromRaw(req), config.token)) {
      rejectUnauthorized(socket);
      return;
    }

    if (!previewProxy.isExposed(target.port)) {
      destroyQuietly(socket);
      return;
    }

    previewProxy.handleUpgrade(target.port, target.rest, req, socket, head);
  };

  server.on("upgrade", dispatch);
}

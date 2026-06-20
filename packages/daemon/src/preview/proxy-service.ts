/**
 * PreviewProxyService — a PATH-MOUNTED reverse proxy that runs THROUGH the main
 * daemon HTTP server (port 7878), not on a separate LAN-only port.
 *
 * Each exposed dev server is reachable at `/__preview/:port/…` on the SAME origin
 * as the dashboard. Because it shares the dashboard's origin it works everywhere
 * the dashboard does — plain http over the LAN AND an https Cloudflare tunnel —
 * with no separate port to forward and no mixed-content blocking.
 *
 * The daemon's routes (servers.ts → handleHttp / app.ts → handleUpgrade) call
 * into this service; it owns the per-target http-proxy-3 instances and the
 * HTML rewrite that makes root-absolute assets resolve under the prefix.
 *
 * AUTH: the proxy entry points are reached only after the daemon's token gate
 * (the `/__preview/*` HTTP route is token-protected like the rest of the API,
 * and the upgrade handler authenticates the token before proxying). So the
 * preview is NOT an open relay — it requires the same token/cookie the dashboard
 * already carries.
 *
 * This class NEVER throws and NEVER lets a proxy error crash the daemon: target
 * errors (dev server down, reset, etc.) are caught and answered with a 502.
 */
import { type Socket } from "node:net";
import { type IncomingMessage, type ServerResponse } from "node:http";

import httpProxy from "http-proxy-3";

import { TOKEN_COOKIE } from "../http/auth.js";
import { previewPrefix, rewriteHtml } from "./html-rewrite.js";

/** A public summary of one exposed preview target. */
export interface PreviewProxyEntry {
  readonly targetPort: number;
}

/**
 * Format a detected bind address into a connectable upstream host. Dev servers
 * often bind IPv6 `::1` (Vite/Next) — connecting to `127.0.0.1` then fails with
 * ECONNREFUSED. Use the family the server actually listens on.
 */
export function formatUpstreamHost(address: string | undefined): string {
  const a = (address ?? "").trim();
  if (!a || a === "0.0.0.0") return "127.0.0.1"; // any-IPv4 → loopback
  if (a === "::" || a === "::1" || a === "[::]") return "[::1]"; // any/loopback IPv6
  return a.includes(":") ? `[${a}]` : a; // bracket IPv6 literals; pass through IPv4/hostnames
}

/**
 * Build the reverse proxy for one dev server. A non-generic wrapper so its
 * inferred return type (with TError defaulting to Error) is reused verbatim as
 * ProxyInstance — `ReturnType<typeof httpProxy.createProxyServer>` would instead
 * resolve the generic TError to `unknown` and mismatch the call site.
 */
function buildProxy(targetPort: number, targetHost: string) {
  return httpProxy.createProxyServer({
    target: `http://${targetHost}:${targetPort}`,
    ws: true,
    // Rewrite Host → target so Vite/webpack host-checks pass through the proxy.
    changeOrigin: true,
    // Forward client address (X-Forwarded-For / -Proto / -Host / -Port).
    xfwd: true,
    // We rewrite proxied HTML ourselves (inject <base>, fix root-absolute URLs),
    // so the proxy must hand us the response instead of streaming it through.
    selfHandleResponse: true,
  });
}

/** The proxy instance type, matching exactly what buildProxy() returns. */
type ProxyInstance = ReturnType<typeof buildProxy>;

/** Internal record: the proxy backing one exposed target. */
interface ProxyRecord {
  readonly targetPort: number;
  readonly proxy: ProxyInstance;
}

const HTTP_BAD_GATEWAY = 502;
const HTTP_NOT_FOUND = 404;

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function log(message: string): void {
  process.stderr.write(`[preview/proxy] ${message}\n`);
}

/** Max HTML we buffer before rewriting, to bound memory on a runaway upstream. */
const MAX_HTML_BYTES = 32 * 1024 * 1024; // 32 MiB

/** Hop-by-hop headers that must not be relayed onto the daemon's own connection. */
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

/**
 * Strip the dashboard's OWN access credentials before forwarding a request to
 * the previewed dev server. The browser auto-attaches the `mc_token` cookie
 * (Path=/) to every same-origin preview request; without this, a previewed dev
 * server — which may run untrusted code, log headers, or forward them — would
 * receive the master token that grants full dashboard control. We remove only
 * `mc_token` from the Cookie header (preserving the app's own cookies) and drop
 * the dashboard-specific `x-mc-token` header. The dev server never needs either.
 */
function stripDashboardCredentials(headers: IncomingMessage["headers"]): void {
  delete headers["x-mc-token"];
  const cookie = headers["cookie"];
  if (typeof cookie === "string") {
    const kept = cookie
      .split(";")
      .map((c) => c.trim())
      .filter((c) => c.length > 0 && !c.toLowerCase().startsWith(`${TOKEN_COOKIE}=`));
    if (kept.length > 0) headers["cookie"] = kept.join("; ");
    else delete headers["cookie"];
  }
}

/** Destroy a socket/stream, swallowing any error (it may already be gone). */
function destroyQuietly(stream: { destroy: () => void }): void {
  try {
    stream.destroy();
  } catch {
    // Already torn down.
  }
}

/** Answer a failed proxy attempt with a 502 (best-effort; never throws). */
function writeBadGateway(res: ServerResponse, targetPort: number, err: unknown): void {
  try {
    if (!res.headersSent) {
      res.writeHead(HTTP_BAD_GATEWAY, { "content-type": "text/plain; charset=utf-8" });
    }
    if (res.writable) {
      res.end(`Preview proxy: upstream :${targetPort} unavailable (${describe(err)})`);
    }
  } catch {
    // Socket already torn down — nothing left to do.
  }
}

/** Answer a request for a port that isn't exposed (best-effort; never throws). */
function writeNotExposed(res: ServerResponse, targetPort: number): void {
  try {
    if (!res.headersSent) {
      res.writeHead(HTTP_NOT_FOUND, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end(`Preview proxy: port :${targetPort} is not exposed`);
  } catch {
    // Socket already torn down.
  }
}

export class PreviewProxyService {
  /** targetPort → proxy record. */
  private readonly byTarget = new Map<number, ProxyRecord>();

  /**
   * Expose `targetPort` so it is reachable at `/__preview/:port/` on the main
   * daemon port. Idempotent: re-exposing an already-exposed target is a no-op.
   * Returns the path prefix the dashboard should open.
   */
  expose(targetPort: number, address?: string): { prefix: string } {
    const existing = this.byTarget.get(targetPort);
    if (existing) {
      return { prefix: previewPrefix(targetPort) };
    }

    const proxy = buildProxy(targetPort, formatUpstreamHost(address));

    // A target error (dev server down/reset) must answer the client, not crash.
    // The 3rd arg is the ServerResponse for web requests, or the socket for ws.
    proxy.on("error", (err: Error, _req: IncomingMessage, resOrSocket: ServerResponse | Socket) => {
      if (isServerResponse(resOrSocket)) {
        writeBadGateway(resOrSocket, targetPort, err);
      } else {
        destroyQuietly(resOrSocket);
      }
      log(`upstream :${targetPort} error: ${describe(err)}`);
    });

    // selfHandleResponse: intercept every upstream response. HTML is buffered and
    // rewritten (inject <base>, fix root-absolute URLs) so assets resolve under
    // the prefix; everything else is streamed straight through unchanged.
    proxy.on("proxyRes", (proxyRes, _req, res) => {
      pipeOrRewrite(proxyRes, res as ServerResponse, targetPort);
    });

    this.byTarget.set(targetPort, { targetPort, proxy });
    log(`exposed :${targetPort} at ${previewPrefix(targetPort)}`);
    return { prefix: previewPrefix(targetPort) };
  }

  /** Tear down the proxy for `targetPort`, if any. Idempotent. Never throws. */
  unexpose(targetPort: number): void {
    const record = this.byTarget.get(targetPort);
    if (!record) {
      return;
    }
    this.byTarget.delete(targetPort);
    closeRecord(record);
  }

  /** Whether `targetPort` is currently exposed. */
  isExposed(targetPort: number): boolean {
    return this.byTarget.has(targetPort);
  }

  /**
   * Proxy a `/__preview/:port/<rest>` HTTP request to the upstream dev server.
   * The `/__preview/:port` prefix is stripped before forwarding (`rest` is the
   * upstream path, already starting with `/`). Never throws.
   */
  handleHttp(targetPort: number, rest: string, req: IncomingMessage, res: ServerResponse): void {
    const record = this.byTarget.get(targetPort);
    if (!record) {
      writeNotExposed(res, targetPort);
      return;
    }
    // Forward the upstream-relative path (prefix already stripped by the caller).
    req.url = rest;
    // Never hand the dashboard token to the previewed dev server.
    stripDashboardCredentials(req.headers);
    record.proxy.web(req, res, { ignorePath: false }, (err: Error) => {
      writeBadGateway(res, targetPort, err);
    });
  }

  /**
   * Proxy a `/__preview/:port/<rest>` WebSocket upgrade (Vite HMR, etc.) to the
   * upstream dev server. The prefix is stripped before forwarding. Never throws.
   */
  handleUpgrade(
    targetPort: number,
    rest: string,
    req: IncomingMessage,
    socket: Socket,
    head: Buffer,
  ): void {
    const record = this.byTarget.get(targetPort);
    if (!record) {
      destroyQuietly(socket);
      return;
    }
    req.url = rest;
    // Never hand the dashboard token to the previewed dev server's WS upstream.
    stripDashboardCredentials(req.headers);
    record.proxy.ws(req, socket, head, { ignorePath: false }, (err: Error) => {
      log(`upstream :${targetPort} ws error: ${describe(err)}`);
      destroyQuietly(socket);
    });
  }

  /** Snapshot of every exposed target (immutable copies). */
  list(): PreviewProxyEntry[] {
    return [...this.byTarget.values()].map((r) => ({ targetPort: r.targetPort }));
  }

  /** Tear down every proxy. Called on daemon shutdown. Never throws. */
  stopAll(): void {
    for (const record of this.byTarget.values()) {
      closeRecord(record);
    }
    this.byTarget.clear();
  }
}

/** True when the proxy error target is an HTTP response (web), not a socket (ws). */
function isServerResponse(value: ServerResponse | Socket): value is ServerResponse {
  return typeof (value as ServerResponse).writeHead === "function";
}

/**
 * With `selfHandleResponse`, the proxy hands us the upstream response and we must
 * relay it. HTML is buffered and rewritten so assets resolve under the preview
 * prefix; every other content type is streamed through byte-for-byte. Never
 * throws — on any error the client socket is closed best-effort.
 */
function pipeOrRewrite(
  proxyRes: IncomingMessage,
  res: ServerResponse,
  targetPort: number,
): void {
  try {
    const headers = { ...proxyRes.headers };
    const status = proxyRes.statusCode ?? HTTP_BAD_GATEWAY;
    const isHtml = (headers["content-type"] ?? "").toString().toLowerCase().includes("text/html");

    if (!isHtml) {
      // Non-HTML: stream straight through, but drop hop-by-hop headers first so
      // an upstream `transfer-encoding`/`connection` can't corrupt the daemon's
      // own connection framing — Node re-frames the piped stream itself.
      for (const h of HOP_BY_HOP) delete headers[h];
      res.writeHead(status, headers);
      proxyRes.pipe(res);
      return;
    }

    // HTML: buffer the body, rewrite it, and send with a corrected length. The
    // upstream content-length no longer matches after rewriting, so drop it; also
    // drop transfer-encoding (the dev server may have chunked the response) since
    // we now send a single buffer with an explicit content-length, and the two
    // headers are mutually exclusive (invalid HTTP if both are present).
    delete headers["content-length"];
    delete headers["transfer-encoding"];
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;
    proxyRes.on("data", (chunk: Buffer) => {
      if (aborted) return;
      total += chunk.length;
      if (total > MAX_HTML_BYTES) {
        // Runaway/streaming HTML — stop buffering rather than risk OOM.
        aborted = true;
        log(`html for :${targetPort} exceeded ${MAX_HTML_BYTES} bytes — aborting`);
        destroyQuietly(proxyRes);
        destroyQuietly(res);
        return;
      }
      chunks.push(chunk);
    });
    proxyRes.on("end", () => {
      if (aborted) return;
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        const rewritten = rewriteHtml(body, targetPort);
        const out = Buffer.from(rewritten, "utf8");
        headers["content-length"] = String(out.length);
        res.writeHead(status, headers);
        res.end(out);
      } catch (err) {
        log(`html rewrite for :${targetPort} failed: ${describe(err)}`);
        destroyQuietly(res);
      }
    });
    proxyRes.on("error", (err) => {
      log(`upstream :${targetPort} response error: ${describe(err)}`);
      destroyQuietly(res);
    });
  } catch (err) {
    log(`proxyRes handling for :${targetPort} failed: ${describe(err)}`);
    destroyQuietly(res);
  }
}

/** Close one proxy record, swallowing any error. */
function closeRecord(record: ProxyRecord): void {
  try {
    record.proxy.close();
  } catch (err) {
    log(`proxy close for :${record.targetPort} failed: ${describe(err)}`);
  }
}

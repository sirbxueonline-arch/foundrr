/**
 * PreviewProxyService — runs 0.0.0.0 reverse proxies so localhost-only dev
 * servers (Vite/Next/etc., which usually bind 127.0.0.1) can be previewed from
 * a phone over the LAN/Tailscale at http://<dashboard-host>:<proxyPort>/.
 *
 * Each exposed dev server gets its own http.createServer bound on 0.0.0.0:0
 * (OS-assigned port) wrapping an http-proxy-3 instance pointed at
 * http://127.0.0.1:<targetPort>. `changeOrigin` rewrites the outgoing Host
 * header to the target so dev-server host checks ("Blocked request. This host
 * is not allowed.") pass; `ws:true` proxies the HMR / live-reload upgrade so
 * hot reload keeps working through the proxy.
 *
 * SECURITY: an exposed proxy port is UNAUTHENTICATED raw access to the dev
 * server on the LAN — the same exposure as the dev server itself binding
 * 0.0.0.0. This is intentional for preview (a phone browser can't send the
 * dashboard token), and every proxy is torn down on daemon shutdown via
 * stopAll() so it never outlives the process.
 *
 * This class NEVER throws and NEVER lets a proxy error crash the daemon: target
 * errors (dev server down, reset, etc.) are caught and answered with a 502.
 */
import { type AddressInfo, type Socket } from "node:net";
import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";

import httpProxy from "http-proxy-3";

import {
  PREVIEW_PROXY_EPHEMERAL_PORT,
  PREVIEW_PROXY_HOST,
} from "../constants.js";

/** A public summary of one running preview proxy. */
export interface PreviewProxyEntry {
  readonly targetPort: number;
  readonly proxyPort: number;
}

/**
 * Build the reverse proxy for one dev server. A non-generic wrapper so its
 * inferred return type (with TError defaulting to Error) is reused verbatim as
 * ProxyInstance — `ReturnType<typeof httpProxy.createProxyServer>` would instead
 * resolve the generic TError to `unknown` and mismatch the call site.
 */
function buildProxy(targetPort: number) {
  return httpProxy.createProxyServer({
    target: `http://127.0.0.1:${targetPort}`,
    ws: true,
    // Rewrite Host → target so Vite/webpack host-checks pass through the proxy.
    changeOrigin: true,
    // Forward client address (X-Forwarded-For / -Proto / -Host / -Port).
    xfwd: true,
  });
}

/** The proxy instance type, matching exactly what buildProxy() returns. */
type ProxyInstance = ReturnType<typeof buildProxy>;

/** Internal record: the live server + proxy backing one exposed target. */
interface ProxyRecord {
  readonly targetPort: number;
  readonly proxyPort: number;
  readonly server: Server;
  readonly proxy: ProxyInstance;
}

const HTTP_BAD_GATEWAY = 502;

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function log(message: string): void {
  process.stderr.write(`[preview/proxy] ${message}\n`);
}

/** True when the proxy error target is an HTTP response (web), not a socket (ws). */
function isServerResponse(value: ServerResponse | Socket): value is ServerResponse {
  return typeof (value as ServerResponse).writeHead === "function";
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

export class PreviewProxyService {
  /** targetPort → running proxy record. */
  private readonly byTarget = new Map<number, ProxyRecord>();

  /**
   * Expose `targetPort` behind a 0.0.0.0 reverse proxy and return the assigned
   * proxy port. Idempotent: if `targetPort` is already exposed, the existing
   * proxy is reused and its port returned (no second listener).
   */
  async expose(targetPort: number): Promise<{ proxyPort: number }> {
    const existing = this.byTarget.get(targetPort);
    if (existing) {
      return { proxyPort: existing.proxyPort };
    }

    const proxy = buildProxy(targetPort);

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

    const server = http.createServer((req, res) => {
      // 3-arg form (req, res, callback): the callback is the per-request error
      // handler; together with the proxy "error" listener nothing crashes.
      proxy.web(req, res, (err: Error) => {
        writeBadGateway(res, targetPort, err);
      });
    });

    // HMR / live-reload websockets — proxy the upgrade to the dev server.
    server.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
      proxy.ws(req, socket, head, (err: Error) => {
        log(`upstream :${targetPort} ws error: ${describe(err)}`);
        destroyQuietly(socket);
      });
    });

    // A late server-level error must never bubble up and crash the daemon.
    server.on("error", (err) => {
      log(`proxy server for :${targetPort} error: ${describe(err)}`);
    });

    const proxyPort = await listen(server);

    this.byTarget.set(targetPort, { targetPort, proxyPort, server, proxy });
    log(`exposed :${targetPort} at 0.0.0.0:${proxyPort}`);
    return { proxyPort };
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

  /** Snapshot of every running proxy (immutable copies). */
  list(): PreviewProxyEntry[] {
    return [...this.byTarget.values()].map((r) => ({
      targetPort: r.targetPort,
      proxyPort: r.proxyPort,
    }));
  }

  /** Tear down every proxy. Called on daemon shutdown. Never throws. */
  stopAll(): void {
    for (const record of this.byTarget.values()) {
      closeRecord(record);
    }
    this.byTarget.clear();
  }
}

/** Close one proxy record's server + proxy, swallowing any error. */
function closeRecord(record: ProxyRecord): void {
  try {
    record.proxy.close();
  } catch (err) {
    log(`proxy close for :${record.targetPort} failed: ${describe(err)}`);
  }
  try {
    record.server.close();
  } catch (err) {
    log(`server close for :${record.targetPort} failed: ${describe(err)}`);
  }
}

/** Listen on 0.0.0.0:0 and resolve with the OS-assigned port. */
function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error): void => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = (): void => {
      server.off("error", onError);
      const address = server.address();
      const port = address && typeof address === "object"
        ? (address as AddressInfo).port
        : 0;
      resolve(port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(PREVIEW_PROXY_EPHEMERAL_PORT, PREVIEW_PROXY_HOST);
  });
}

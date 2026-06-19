/**
 * Access routes — back the in-dashboard "Access from anywhere" panel.
 * All token-protected. Each handler is wrapped so a failure NEVER throws out of
 * the route; the dashboard polls these and should degrade gracefully, never 500.
 *
 *   GET    /api/access         → { port, boundHost, addresses[], tunnel }
 *   POST   /api/access/tunnel  → start a managed cloudflared tunnel (async)
 *   DELETE /api/access/tunnel  → tear the tunnel down
 *
 * The tunnel `url` in responses carries the ?token= so it's directly openable.
 */
import type { FastifyInstance } from "fastify";

import { listAddresses } from "../../access/addresses.js";
import type { TunnelStatus } from "../../access/tunnel-manager.js";
import { isCloudflaredInstalled } from "../../cli/cloudflared.js";
import { tokenizedUrl } from "../../cli/dashboard-url.js";
import type { AppContext } from "../context.js";
import { requireToken } from "../auth.js";

/** Install help when cloudflared is missing (macOS-first; matches the CLI). */
const INSTALL_CMD = "brew install cloudflared";

interface TunnelView extends TunnelStatus {
  /** Tokenized openable URL (only when state is "on"), else null. */
  readonly url: string | null;
  readonly installed: boolean;
}

/** Shape a TunnelStatus into the dashboard view: tokenize the URL + add install. */
function tunnelView(
  status: TunnelStatus,
  token: string,
  installed: boolean,
): TunnelView {
  return {
    state: status.state,
    url: status.url ? tokenizedUrl(status.url, token) : null,
    error: status.error,
    installed,
  };
}

export function registerAccessRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  const guard = { preHandler: requireToken(ctx.config.token) };
  const { config, tunnelManager } = ctx;

  app.get("/api/access", guard, async (req, reply) => {
    try {
      const { boundHost, addresses } = listAddresses(
        config.host,
        config.port,
        config.token,
      );
      const installed = await isCloudflaredInstalled();
      return reply.send({
        port: config.port,
        boundHost,
        addresses,
        tunnel: tunnelView(tunnelManager.status(), config.token, installed),
      });
    } catch (err) {
      req.log.error({ err }, "api/access failed");
      // Fail safe: return an empty-but-valid snapshot rather than throwing.
      return reply.send({
        port: config.port,
        boundHost: config.host,
        addresses: [],
        tunnel: { state: "error", url: null, error: "internal error", installed: false },
      });
    }
  });

  app.post("/api/access/tunnel", guard, async (req, reply) => {
    try {
      const installed = await isCloudflaredInstalled();
      if (!installed) {
        // Not an error response code — the panel renders the install hint.
        return reply.send({
          state: "error",
          url: null,
          error: "cloudflared not installed",
          installCmd: INSTALL_CMD,
          installed: false,
        });
      }
      const status = tunnelManager.start(config.port);
      return reply.send(tunnelView(status, config.token, true));
    } catch (err) {
      req.log.error({ err }, "api/access/tunnel start failed");
      return reply.send({
        state: "error",
        url: null,
        error: "failed to start tunnel",
        installCmd: INSTALL_CMD,
        installed: false,
      });
    }
  });

  app.delete("/api/access/tunnel", guard, async (req, reply) => {
    try {
      tunnelManager.stop();
      return reply.send({ state: "off", url: null, error: null });
    } catch (err) {
      req.log.error({ err }, "api/access/tunnel stop failed");
      // Even on failure the user's intent is "off"; report it.
      return reply.send({ state: "off", url: null, error: null });
    }
  });
}

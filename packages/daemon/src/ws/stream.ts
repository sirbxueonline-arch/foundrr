/**
 * WS /stream — authenticated live event stream. On connect, sends a snapshot
 * then registers the socket for broadcasts. Inbound messages are ignored in M1.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";

import type { SnapshotMessage } from "@mission-control/shared";

import type { AppContext } from "../http/context.js";
import { extractToken, isValidToken } from "../http/auth.js";

export function registerStreamRoute(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.get(
    "/stream",
    {
      websocket: true,
      onRequest: (req: FastifyRequest, reply, done) => {
        // Authenticate the upgrade before opening the socket.
        if (!isValidToken(extractToken(req), ctx.config.token)) {
          reply.code(401).send({ error: "unauthorized" });
          return;
        }
        done();
      },
    },
    (socket: WebSocket) => {
      ctx.registry.add(socket);

      const snapshot: SnapshotMessage = {
        type: "snapshot",
        sessions: ctx.eventHub.getSnapshot(),
        servers: ctx.serverMonitor.getLatest(),
        approvals: ctx.approvalStore.listActive(),
        cost: ctx.costStore.snapshot(),
        serverTime: Date.now(),
      };

      try {
        socket.send(JSON.stringify(snapshot));
      } catch {
        // Client gone before first send — drop it.
        ctx.registry.delete(socket);
        return;
      }

      socket.on("close", () => ctx.registry.delete(socket));
      socket.on("error", () => ctx.registry.delete(socket));
      // Inbound messages are ignored for now.
    },
  );
}

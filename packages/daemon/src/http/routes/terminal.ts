/**
 * Terminal routes (all token-protected):
 *   GET    /api/term       — list open terminal tabs (restore tab ids on reload)
 *   DELETE /api/term/:id   — terminate + free a pty
 *
 * Never throws out: 400 for bad input, 500 otherwise.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { ApiError } from "@mission-control/shared";

import type { AppContext } from "../context.js";
import { requireToken } from "../auth.js";

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function serverError(reply: FastifyReply, err: unknown): FastifyReply {
  const body: ApiError = { error: describe(err) };
  return reply.code(500).send(body);
}

export function registerTerminalRoute(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  const guard = { preHandler: requireToken(ctx.config.token) };

  app.get("/api/term", guard, async (_req, reply) => {
    try {
      return ctx.ptyManager.list();
    } catch (err) {
      return serverError(reply, err);
    }
  });

  app.delete(
    "/api/term/:id",
    guard,
    async (req: FastifyRequest, reply) => {
      try {
        const id = String((req.params as Record<string, unknown>)["id"] ?? "");
        if (id.length === 0) {
          const body: ApiError = { error: "id is required" };
          return reply.code(400).send(body);
        }
        ctx.ptyManager.kill(id);
        return { ok: true };
      } catch (err) {
        return serverError(reply, err);
      }
    },
  );
}

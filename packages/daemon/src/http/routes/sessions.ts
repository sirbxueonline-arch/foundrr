/**
 * GET /api/sessions — token-protected snapshot of all derived sessions.
 */
import type { FastifyInstance } from "fastify";

import type { AppContext } from "../context.js";
import { requireToken } from "../auth.js";

export function registerSessionsRoute(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.get(
    "/api/sessions",
    { preHandler: requireToken(ctx.config.token) },
    async () => {
      return ctx.eventHub.getSnapshot();
    },
  );
}

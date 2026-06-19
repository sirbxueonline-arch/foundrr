/**
 * GET /healthz — public liveness probe (no token required).
 */
import type { FastifyInstance } from "fastify";

const VERSION = "0.1.0";

export function registerHealthRoute(app: FastifyInstance): void {
  app.get("/healthz", async () => {
    return { ok: true, version: VERSION };
  });
}

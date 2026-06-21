/**
 * License routes — read, set, and clear this install's Pro/Team key.
 *
 *   GET    /api/license   → Entitlement (cached verdict + grace resolution)
 *   POST   /api/license   → body { key } → store + verify now → Entitlement
 *   DELETE /api/license   → clear the key → Entitlement (free)
 *
 * Token-protected. The dashboard's Settings → License panel is the only caller.
 * Issuance/billing lives in the landing app; the daemon only stores the key and
 * caches what the verify endpoint reports. Handlers are wrapped so a db or
 * network hiccup degrades to a 500 with a plain message rather than throwing.
 */
import type { FastifyInstance } from "fastify";

import type { AppContext } from "../context.js";
import { requireToken } from "../auth.js";

export function registerLicenseRoutes(app: FastifyInstance, ctx: AppContext): void {
  const guard = { preHandler: requireToken(ctx.config.token) };

  app.get("/api/license", guard, async (req, reply) => {
    try {
      return reply.send(ctx.licenseService.entitlement());
    } catch (err) {
      req.log.error({ err }, "api/license read failed");
      return reply.code(500).send({ error: "failed to read license" });
    }
  });

  app.post("/api/license", guard, async (req, reply) => {
    try {
      const body = req.body as { key?: unknown } | undefined;
      const key = typeof body?.key === "string" ? body.key.trim() : "";
      if (!key) {
        return reply.code(400).send({ error: "missing license key" });
      }
      const entitlement = await ctx.licenseService.setKey(key);
      return reply.send(entitlement);
    } catch (err) {
      req.log.error({ err }, "api/license set failed");
      return reply.code(500).send({ error: "failed to set license" });
    }
  });

  app.delete("/api/license", guard, async (req, reply) => {
    try {
      return reply.send(ctx.licenseService.clear());
    } catch (err) {
      req.log.error({ err }, "api/license clear failed");
      return reply.code(500).send({ error: "failed to clear license" });
    }
  });

  // Open a Stripe Customer Portal session for the stored key — the user manages
  // (and cancels) their subscription there. 502 when no key / authority down.
  app.post("/api/license/portal", guard, async (req, reply) => {
    try {
      const url = await ctx.licenseService.billingPortalUrl();
      if (!url) {
        return reply.code(502).send({ error: "could not open billing portal" });
      }
      return reply.send({ url });
    } catch (err) {
      req.log.error({ err }, "api/license/portal failed");
      return reply.code(500).send({ error: "failed to open billing portal" });
    }
  });
}

/**
 * Telegram routes — the away-surface link indicator the dashboard polls.
 *
 * Dashboard-facing:
 *   GET /api/telegram/status → { linked: boolean, hasToken: boolean }
 *     - hasToken: a bot token is configured ($TELEGRAM_BOT_TOKEN OR the
 *       telegram.bot_token db row).
 *     - linked:   a chat_id is bound (the phone can receive notifications).
 *
 * Token-protected. The handler is wrapped so a failure NEVER throws out of the
 * route — a db read error degrades to { linked: false, hasToken: false } so the
 * dashboard renders the "run `mc telegram setup`" hint rather than crashing.
 */
import type { FastifyInstance } from "fastify";

import { getTelegram } from "../../db/telegram-repo.js";
import type { AppContext } from "../context.js";
import { requireToken } from "../auth.js";

export function registerTelegramRoute(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  const guard = { preHandler: requireToken(ctx.config.token) };

  app.get("/api/telegram/status", guard, async (req, reply) => {
    try {
      const binding = getTelegram(ctx.db);
      const envToken = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
      const hasToken = Boolean(envToken) || Boolean(binding.botToken);
      const linked = Boolean(binding.chatId);
      return reply.send({ linked, hasToken });
    } catch (err) {
      req.log.error({ err }, "api/telegram/status failed");
      // Fail safe: report "unconfigured" rather than throwing.
      return reply.send({ linked: false, hasToken: false });
    }
  });
}

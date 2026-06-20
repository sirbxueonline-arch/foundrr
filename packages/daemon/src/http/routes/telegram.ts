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
import { getSettings, setTelegramMode } from "../../db/settings-repo.js";
import { SharedBot } from "../../telegram/shared-bot.js";
import { resolveInstallId } from "../../telemetry/install-id.js";
import type { AppContext } from "../context.js";
import { requireToken } from "../auth.js";

const HTTP_BAD_GATEWAY = 502;
const HTTP_SERVER_ERROR = 500;

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

  // One-tap link from the dashboard: turn the leash ON (shared mode) if it is
  // off, then fetch a single-use link code from the Foundrr shared bot relay.
  // The dashboard shows the code + which bot to message — no CLI needed.
  //   → { ok: true, mode: "shared", botUsername, linkCode }
  //   → { ok: true, mode: "own" }            (user links via /link <token>)
  //   → { ok: false, error }                 (relay unreachable / failure)
  app.post("/api/telegram/link", guard, async (req, reply) => {
    try {
      let mode = getSettings(ctx.db).telegramMode;
      if (mode === "off") {
        // "Toggle on the bot": enabling shared mode is the first half of the tap.
        setTelegramMode(ctx.db, "shared");
        mode = "shared";
      }

      if (mode === "own") {
        // Own-bot users link by messaging their bot the access token directly.
        return reply.send({ ok: true, mode: "own" });
      }

      const installId = resolveInstallId(ctx.config.home);
      const result = await new SharedBot(installId).link();
      if (!result) {
        return reply.code(HTTP_BAD_GATEWAY).send({
          ok: false,
          error: "Could not reach the Foundrr bot relay. Check your connection and retry.",
        });
      }
      return reply.send({
        ok: true,
        mode: "shared",
        botUsername: result.botUsername,
        linkCode: result.linkCode,
      });
    } catch (err) {
      req.log.error({ err }, "api/telegram/link failed");
      return reply
        .code(HTTP_SERVER_ERROR)
        .send({ ok: false, error: "Failed to create a Telegram link code." });
    }
  });
}

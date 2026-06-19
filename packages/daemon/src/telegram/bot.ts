/**
 * TelegramService — owns the grammY bot lifecycle for the "leash" (M6 notify +
 * M7 remote approve). Designed to DEGRADE GRACEFULLY in every direction:
 *
 *   - No bot token (neither $TELEGRAM_BOT_TOKEN nor the telegram.bot_token db
 *     row) → the service is permanently disabled; start()/notify()/sendApproval()
 *     are safe no-ops and the rest of the daemon runs exactly as before.
 *   - A bad/revoked token → caught and logged; the daemon stays alive.
 *   - No bound chat → notify() is a no-op and sendApproval() returns undefined.
 *     Approvals STILL work end-to-end via the dashboard.
 *   - Any send/polling error → swallowed; never propagated to callers.
 *
 * Long-polling (`bot.start()`, NOT awaited — it only resolves when the bot
 * stops) is used because the daemon is a localhost process with no public URL.
 *
 * Verified grammY 1.44 API:
 *   - new InlineKeyboard().text(label, callbackData)  (callbackData ≤ 64 bytes)
 *   - bot.api.sendMessage(chatId, text, { reply_markup })
 *   - bot.on("callback_query:data", ...) then ctx.answerCallbackQuery()
 *   - bot.command("link", ...) with ctx.match = text after the command
 */
import { timingSafeEqual } from "node:crypto";

import { Bot, InlineKeyboard } from "grammy";
import type Database from "better-sqlite3";

import type { ApprovalRequest } from "@mission-control/shared";

import type { Config } from "../config.js";
import {
  getTelegram,
  setChatId,
} from "../db/telegram-repo.js";
import type { PtyManager } from "../pty/manager.js";
import type { ApprovalStore } from "../approvals/store.js";

/** Telegram callback_data is capped at 64 bytes — carry only the action+id. */
const APPROVE_PREFIX = "approve";
const DENY_PREFIX = "deny";

export interface TelegramDeps {
  readonly db: Database.Database;
  readonly approvalStore: ApprovalStore;
  readonly ptyManager: PtyManager;
  readonly config: Config;
}

export class TelegramService {
  private bot: Bot | undefined;
  private enabled = false;
  /** Cached message_id per approval id, so a tap can edit the right message. */
  private readonly approvalMessages = new Map<string, number>();

  constructor(private readonly deps: TelegramDeps) {}

  /** Whether a bot was successfully constructed and started. */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Resolve the bot token: $TELEGRAM_BOT_TOKEN wins, else the db row. Returns
   * undefined (→ disabled) when neither is set.
   */
  private resolveToken(): string | undefined {
    const fromEnv = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
    if (fromEnv) {
      return fromEnv;
    }
    try {
      const stored = getTelegram(this.deps.db).botToken?.trim();
      return stored && stored.length > 0 ? stored : undefined;
    } catch (err) {
      this.log(`failed to read stored bot token: ${describe(err)}`);
      return undefined;
    }
  }

  /** Currently-bound chat id (from the db), or undefined if unbound. */
  private boundChatId(): string | undefined {
    try {
      const chatId = getTelegram(this.deps.db).chatId?.trim();
      return chatId && chatId.length > 0 ? chatId : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Start the bot if a token exists. Never throws: construction/polling errors
   * leave the service disabled and the daemon healthy.
   */
  start(): void {
    const token = this.resolveToken();
    if (!token) {
      this.log("no bot token — Telegram disabled (this is fine).");
      return;
    }

    try {
      const bot = new Bot(token);
      this.registerHandlers(bot);

      // Surface polling errors instead of letting them crash the process.
      bot.catch((err) => {
        this.log(`polling error: ${describe(err.error ?? err)}`);
      });

      // Do NOT await — bot.start() resolves only when the bot stops.
      void bot.start({
        onStart: (info) => this.log(`bot @${info.username} online (long-polling).`),
      });

      this.bot = bot;
      this.enabled = true;
    } catch (err) {
      this.enabled = false;
      this.log(`failed to start bot: ${describe(err)}`);
    }
  }

  /** Register /link, callback taps, and the plain-text quick-reply handler. */
  private registerHandlers(bot: Bot): void {
    bot.command("link", async (ctx) => {
      try {
        await this.handleLink(ctx);
      } catch (err) {
        this.log(`/link handler error: ${describe(err)}`);
      }
    });

    bot.on("callback_query:data", async (ctx) => {
      try {
        await this.handleCallback(ctx);
      } catch (err) {
        this.log(`callback handler error: ${describe(err)}`);
        // Always stop the client spinner, even on error.
        try {
          await ctx.answerCallbackQuery();
        } catch {
          /* ignore */
        }
      }
    });

    // Plain text (a message that is NOT a command) → quick-reply into a PTY.
    bot.on("message:text", async (ctx) => {
      try {
        await this.handleQuickReply(ctx);
      } catch (err) {
        this.log(`quick-reply handler error: ${describe(err)}`);
      }
    });
  }

  /** `/link <token>`: timing-safe compare against config.token, bind the chat. */
  private async handleLink(ctx: LinkCtx): Promise<void> {
    const supplied = ctx.match.trim();
    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      return;
    }

    if (!this.tokenMatches(supplied)) {
      await ctx.reply("❌ Invalid token.");
      return;
    }

    try {
      setChatId(this.deps.db, String(chatId));
    } catch (err) {
      this.log(`failed to persist chat id: ${describe(err)}`);
      await ctx.reply("❌ Could not save the link. Check the daemon logs.");
      return;
    }
    await ctx.reply(
      "✅ Linked. You'll get notifications and approval requests here.",
    );
  }

  /** Constant-time compare of a supplied token to the configured access token. */
  private tokenMatches(supplied: string): boolean {
    const expected = this.deps.config.token;
    if (supplied.length === 0 || supplied.length !== expected.length) {
      return false;
    }
    try {
      return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  /** An inline Approve/Deny tap: resolve the request and update the message. */
  private async handleCallback(ctx: CallbackCtx): Promise<void> {
    const data = ctx.callbackQuery?.data ?? "";
    const sep = data.indexOf(":");
    const action = sep === -1 ? data : data.slice(0, sep);
    const id = sep === -1 ? "" : data.slice(sep + 1);

    if (!id || (action !== APPROVE_PREFIX && action !== DENY_PREFIX)) {
      await ctx.answerCallbackQuery({ text: "Unrecognized action" });
      return;
    }

    const decision = action === APPROVE_PREFIX ? "allow" : "deny";
    const reason =
      decision === "allow"
        ? "Approved via Telegram"
        : "Denied via Telegram";

    const resolved = this.deps.approvalStore.resolve(
      id,
      decision,
      "telegram",
      reason,
    );

    // ALWAYS stop the client spinner.
    if (!resolved) {
      await ctx.answerCallbackQuery({ text: "Already handled or expired" });
      await this.clearKeyboard(ctx);
      return;
    }

    const wasFresh = resolved.state === (decision === "allow" ? "allowed" : "denied")
      && resolved.decidedBy === "telegram";
    await ctx.answerCallbackQuery({
      text: wasFresh ? "Recorded" : "Already resolved",
    });

    const verb = resolved.state === "allowed" ? "✅ Approved" : resolved.state === "denied" ? "❌ Denied" : "⌛ Expired";
    await this.editResolved(ctx, resolved, verb);
    this.approvalMessages.delete(id);
  }

  /** Edit the approval message in place to show the final decision. */
  private async editResolved(
    ctx: CallbackCtx,
    req: ApprovalRequest,
    verb: string,
  ): Promise<void> {
    const text = [
      `${verb} — ${req.summary}`,
      "",
      code(req.detail),
      "",
      `project: ${req.project}`,
    ].join("\n");
    try {
      await ctx.editMessageText(text, { reply_markup: undefined });
    } catch (err) {
      // Message may be too old to edit, or already edited — log and move on.
      this.log(`editMessageText failed: ${describe(err)}`);
    }
  }

  /** Strip the inline keyboard from a message we couldn't resolve. */
  private async clearKeyboard(ctx: CallbackCtx): Promise<void> {
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } catch {
      /* ignore */
    }
  }

  /** Plain text from the bound chat → inject into the active PTY. */
  private async handleQuickReply(ctx: QuickReplyCtx): Promise<void> {
    const text = ctx.message?.text?.trim() ?? "";
    if (!text || text.startsWith("/")) {
      return; // commands are handled elsewhere.
    }

    // Only accept quick-replies from the bound chat.
    const bound = this.boundChatId();
    const fromChat = ctx.chat?.id;
    if (bound === undefined || fromChat === undefined || String(fromChat) !== bound) {
      return;
    }

    const injected = this.deps.ptyManager.injectPrompt(text);
    if (injected) {
      await ctx.reply("✓ Sent to your active terminal.");
    } else {
      await ctx.reply(
        "No active terminal to send to (open one in the dashboard's Terminal tab first). " +
          "Quick-replies can only reach terminals Mission Control spawned, not external claude sessions.",
      );
    }
  }

  /**
   * Send a one-line notification to the bound chat. No-op if disabled or
   * unbound; send errors are swallowed.
   */
  async notify(text: string): Promise<void> {
    if (!this.enabled || !this.bot) {
      return;
    }
    const chatId = this.boundChatId();
    if (!chatId) {
      return;
    }
    try {
      await this.bot.api.sendMessage(chatId, text);
    } catch (err) {
      this.log(`notify failed: ${describe(err)}`);
    }
  }

  /**
   * Send an inline Approve/Deny message for a pending approval. Returns the
   * Telegram message_id (cached so the callback can edit it), or undefined if
   * disabled / unbound / the send failed — the approval still works via the
   * dashboard in all of those cases.
   */
  async sendApproval(req: ApprovalRequest): Promise<number | undefined> {
    if (!this.enabled || !this.bot) {
      return undefined;
    }
    const chatId = this.boundChatId();
    if (!chatId) {
      return undefined;
    }

    const keyboard = new InlineKeyboard()
      .text("✅ Approve", `${APPROVE_PREFIX}:${req.id}`)
      .text("❌ Deny", `${DENY_PREFIX}:${req.id}`);

    const text = [
      `🔐 Approval needed — ${req.summary}`,
      "",
      code(req.detail),
      "",
      `project: ${req.project}`,
    ].join("\n");

    try {
      const sent = await this.bot.api.sendMessage(chatId, text, {
        reply_markup: keyboard,
      });
      this.approvalMessages.set(req.id, sent.message_id);
      return sent.message_id;
    } catch (err) {
      this.log(`sendApproval failed: ${describe(err)}`);
      return undefined;
    }
  }

  /** Stop long-polling. Safe to call when disabled. */
  async stop(): Promise<void> {
    if (!this.bot) {
      return;
    }
    try {
      await this.bot.stop();
    } catch (err) {
      this.log(`stop failed: ${describe(err)}`);
    } finally {
      this.bot = undefined;
      this.enabled = false;
    }
  }

  private log(msg: string): void {
    process.stderr.write(`[telegram] ${msg}\n`);
  }
}

/** Wrap text in a Telegram-safe inline code span (no Markdown parse mode set, */
/** so we use plain backticks for a monospace hint without risking parse errors). */
function code(s: string): string {
  return s.length > 0 ? `\`${s}\`` : "(empty)";
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Minimal structural context types ────────────────────────────────────────
// We type only the surface we touch, to avoid over-coupling to grammY's deep
// generic context types (and to keep these handlers easy to read).

interface LinkCtx {
  // For a command handler grammY sets ctx.match to the text after the command.
  readonly match: string;
  readonly chat?: { id: number };
  reply(text: string): Promise<unknown>;
}

interface CallbackCtx {
  readonly callbackQuery?: { data?: string };
  answerCallbackQuery(opts?: { text?: string }): Promise<unknown>;
  editMessageText(
    text: string,
    other?: { reply_markup?: undefined },
  ): Promise<unknown>;
  editMessageReplyMarkup(other?: { reply_markup?: undefined }): Promise<unknown>;
}

interface QuickReplyCtx {
  readonly message?: { text?: string };
  readonly chat?: { id: number };
  reply(text: string): Promise<unknown>;
}

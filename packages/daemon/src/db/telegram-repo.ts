/**
 * CRUD over the singleton `telegram` table (id is pinned to 1 via a CHECK).
 * Stores the bot token (set via `mc telegram setup`) and the bound chat id
 * (set when a user runs `/link <token>` in Telegram). Both are nullable: the
 * service degrades gracefully when either is absent.
 */
import type Database from "better-sqlite3";

interface TelegramRow {
  chat_id: string | null;
  bot_token: string | null;
}

export interface TelegramBinding {
  readonly chatId: string | null;
  readonly botToken: string | null;
}

const EMPTY: TelegramBinding = { chatId: null, botToken: null };

/** Read the singleton row, or an all-null binding if unset. */
export function getTelegram(db: Database.Database): TelegramBinding {
  const row = db
    .prepare("SELECT chat_id, bot_token FROM telegram WHERE id = 1")
    .get() as TelegramRow | undefined;
  if (!row) {
    return EMPTY;
  }
  return { chatId: row.chat_id, botToken: row.bot_token };
}

/** Persist the bot token, preserving any existing chat_id. */
export function setBotToken(db: Database.Database, botToken: string): void {
  db.prepare(
    `INSERT INTO telegram (id, chat_id, bot_token)
     VALUES (1, NULL, @bot_token)
     ON CONFLICT(id) DO UPDATE SET bot_token = excluded.bot_token`,
  ).run({ bot_token: botToken });
}

/** Persist the bound chat id, preserving any existing bot_token. */
export function setChatId(db: Database.Database, chatId: string): void {
  db.prepare(
    `INSERT INTO telegram (id, chat_id, bot_token)
     VALUES (1, @chat_id, NULL)
     ON CONFLICT(id) DO UPDATE SET chat_id = excluded.chat_id`,
  ).run({ chat_id: chatId });
}

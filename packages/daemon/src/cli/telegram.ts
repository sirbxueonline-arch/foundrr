/**
 * `mc telegram` — configure the Telegram leash from the CLI.
 *
 *   mc telegram setup <botToken>   Store the bot token in the telegram table.
 *   mc telegram status             Show whether a token is stored + chat linked.
 *
 * We only touch the db (reusing loadConfig + openDb); we never start the bot
 * here. Binding the chat happens at runtime via `/link <token>` in Telegram.
 */
import { loadConfig } from "../config.js";
import { openDb } from "../db/index.js";
import { getTelegram, setBotToken } from "../db/telegram-repo.js";
import { color, dim, err, ok } from "./util.js";

const BOTFATHER_HELP = `To get a bot token:
  1. Open Telegram and message @BotFather
  2. Send /newbot and follow the prompts (name + username)
  3. BotFather replies with a token like 123456:ABC-DEF...
  4. Run: mc telegram setup <that-token>`;

function runSetup(botToken: string | undefined): void {
  if (!botToken || botToken.trim().length === 0) {
    process.stdout.write(`\n${color.bold("Mission Control — Telegram setup")}\n\n`);
    dim(BOTFATHER_HELP);
    process.stdout.write("\n");
    return;
  }

  const config = loadConfig();
  const db = openDb(config.dbPath);
  try {
    setBotToken(db, botToken.trim());
  } finally {
    db.close();
  }

  ok("Saved bot token.");
  process.stdout.write("\nNext steps:\n");
  process.stdout.write(`  ${color.cyan("1.")} Start the daemon: ${color.bold("mc start")}\n`);
  process.stdout.write(
    `  ${color.cyan("2.")} From Telegram, message your bot: ${color.bold("/link <ACCESS_TOKEN>")}\n`,
  );
  dim(
    `     (your access token is in the startup URL after ?token=, or in ${config.home}/token)`,
  );
  process.stdout.write("\n");
}

function runStatus(): void {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  let binding;
  try {
    binding = getTelegram(db);
  } finally {
    db.close();
  }

  const envToken = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
  const hasToken = Boolean(envToken) || Boolean(binding.botToken);
  const tokenSource = envToken ? "$TELEGRAM_BOT_TOKEN" : binding.botToken ? "db" : "none";

  process.stdout.write(`\n${color.bold("Mission Control — Telegram status")}\n\n`);
  process.stdout.write(
    `  Bot token : ${hasToken ? color.green("configured") : color.red("not set")} (${tokenSource})\n`,
  );
  process.stdout.write(
    `  Linked chat: ${binding.chatId ? color.green(binding.chatId) : color.red("not linked")}\n\n`,
  );

  if (!hasToken) {
    dim("Run `mc telegram setup <botToken>` to configure a bot.");
  } else if (!binding.chatId) {
    dim("Start the daemon and message your bot `/link <ACCESS_TOKEN>` to bind a chat.");
  } else {
    dim("Ready: notifications and approval requests will reach your linked chat.");
  }
  process.stdout.write("\n");
}

export function runTelegramCli(sub: string | undefined, arg: string | undefined): void {
  switch (sub) {
    case "setup":
      runSetup(arg);
      return;
    case "status":
      runStatus();
      return;
    default:
      err(`unknown telegram subcommand: ${sub ?? "(none)"}`);
      process.stdout.write("usage: mc telegram setup <botToken> | mc telegram status\n");
      process.exitCode = 1;
  }
}

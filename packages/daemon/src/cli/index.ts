#!/usr/bin/env node
/**
 * `mc` CLI entry point. Dispatches: start | hooks | doctor.
 */
import { runConfig } from "./config.js";
import { runDoctor } from "./doctor.js";
import { runHooks } from "./hooks.js";
import { runRotateToken } from "./rotate-token.js";
import { runStart } from "./start.js";
import { runTelegramCli } from "./telegram.js";
import { runTelemetry } from "./telemetry.js";
import { runTunnel } from "./tunnel.js";
import { err } from "./util.js";

const USAGE = `mc — Mission Control daemon + CLI

Usage:
  mc start              Start the daemon and print the dashboard URL
  mc hooks print        Print a paste-ready hooks block for ~/.claude/settings.json
  mc hooks install      Install the hooks into ~/.claude/settings.json (with backup)
  mc telemetry enable   Print the OTel env block to feed Claude Code cost/token metrics
  mc telemetry share on|off|status  Anonymous global usage sharing (ON by default; easy opt-out)
  mc config model <key>|show  Set/show the agent/model you run (used for the global leaderboard)
  mc telegram setup <t> Store a Telegram bot token (the leash: notify + approve)
  mc telegram status    Show whether a bot token is stored and a chat is linked
  mc tunnel [--yes]     Expose the dashboard at a public HTTPS URL (Cloudflare; see warning)
  mc rotate-token       Regenerate the access token (revokes the old one) + print the URL
  mc doctor             Run an environment preflight checklist

Access from anywhere:
  Tailscale (recommended) — private, encrypted, works over cellular, NO public
  URL. Run with HOST=0.0.0.0 and reach http://<machine-name>:<PORT>/?token=…
  Cloudflare Tunnel (mc tunnel) — instant public HTTPS URL, but exposes a shell.

Environment:
  MC_HOME             home dir (default ~/.mission-control)
  MC_TOKEN            override the access token
  TELEGRAM_BOT_TOKEN  bot token (overrides the stored one; leaves Telegram on)
  PORT                HTTP port (default 7878)
  HOST                bind host (default 127.0.0.1; set 0.0.0.0 for remote/Tailscale)
`;

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const sub = process.argv[3];

  if (cmd === "--help" || cmd === "-h" || cmd === undefined) {
    process.stdout.write(USAGE);
    return;
  }

  switch (cmd) {
    case "start":
      await runStart();
      return;
    case "hooks":
      runHooks(sub);
      return;
    case "telemetry":
      runTelemetry(sub, process.argv[4]);
      return;
    case "config":
      runConfig(sub, process.argv[4]);
      return;
    case "telegram":
      runTelegramCli(sub, process.argv[4]);
      return;
    case "tunnel":
      await runTunnel();
      return;
    case "rotate-token":
      runRotateToken();
      return;
    case "doctor":
      await runDoctor();
      return;
    default:
      process.stdout.write(`unknown command: ${cmd}\n\n${USAGE}`);
      process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  err(e instanceof Error ? e.message : String(e));
  process.exit(1);
});

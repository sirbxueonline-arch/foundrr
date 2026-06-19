/**
 * `mc tunnel` — expose the local dashboard over a public HTTPS URL via a
 * Cloudflare quick tunnel (TryCloudflare), so you can reach it from a phone on
 * cellular or any other network.
 *
 * SECURITY: the daemon streams a real shell (PTY). A publicly reachable instance
 * is therefore as powerful as physical access to this machine — anyone with the
 * URL *and* the token can run arbitrary commands. We print a stark warning and
 * require explicit confirmation (unless `--yes`). Prefer Tailscale (private,
 * no public URL) when you can — see the README "Access from anywhere" section.
 *
 * No new runtime deps: we shell out to `cloudflared` and parse its output.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import { resolveHome, resolveToken } from "../config.js";
import { DEFAULT_PORT } from "../constants.js";
import { findCloudflared, parseTunnelUrl, quickTunnelArgs } from "./cloudflared.js";
import { tokenizedUrl } from "./dashboard-url.js";
import { color, dim, err, ok, warn } from "./util.js";

function resolvedPort(): number {
  const raw = process.env["PORT"];
  if (!raw) {
    return DEFAULT_PORT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed <= 0 || parsed > 65535
    ? DEFAULT_PORT
    : parsed;
}

function printSecurityWarning(port: number): void {
  process.stdout.write(`\n${color.bold("Mission Control — public tunnel")}\n\n`);
  process.stdout.write(
    `${color.red(color.bold("!! STOP AND READ — THIS EXPOSES A SHELL TO THE INTERNET !!"))}\n\n`,
  );
  process.stdout.write(
    `  This publishes the dashboard at a public ${color.bold("https://*.trycloudflare.com")}\n` +
      `  URL. The dashboard streams a real terminal (PTY). Anyone who obtains the\n` +
      `  URL ${color.bold("and the access token")} can run ${color.bold("arbitrary commands")} on this machine —\n` +
      `  it is as powerful as ${color.bold("physical access")}.\n\n`,
  );
  process.stdout.write(`  ${color.bold("Safer alternative:")} use Tailscale. It gives you from-anywhere\n`);
  process.stdout.write(
    "  access (works over cellular) over a private, encrypted overlay with\n" +
      `  ${color.bold("no public URL at all")}. Run the daemon with ${color.bold("HOST=0.0.0.0")} and reach it\n` +
      "  at http://<machine-name>:<port>/?token=… See the README.\n\n",
  );
  process.stdout.write(
    `  If you proceed: the token rides in the URL (encrypted in transit over\n` +
      `  HTTPS, and the dashboard strips it from the address bar after load), but\n` +
      `  it can still leak via history/referrer. Treat this tunnel as ${color.bold("temporary")}:\n` +
      `  tear it down with Ctrl+C when you're done, and run ${color.bold("mc rotate-token")} if\n` +
      `  the token may have been exposed.\n\n`,
  );
  dim(`  Local target: http://127.0.0.1:${port}  (run \`mc start\` in another shell)`);
  process.stdout.write("\n");
}

/** Ask for an explicit "yes" on the TTY. Resolves false on EOF/non-interactive. */
function confirm(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(
      `${color.yellow("Type \"yes\" to open a PUBLIC tunnel, anything else to abort: ")}`,
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "yes");
      },
    );
  });
}

const INSTALL_HELP = `cloudflared is not on your PATH.

Install it, then re-run \`mc tunnel\`:
  macOS         brew install cloudflared
  Debian/Ubuntu see https://pkg.cloudflare.com/  (cloudflared package)
  Windows       winget install --id Cloudflare.cloudflared
  Other / docs  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

Prefer no public URL at all? Use Tailscale instead (see the README
"Access from anywhere" section): private, encrypted, works over cellular.`;

/**
 * Spawn the quick tunnel, print the tokenized public URL once cloudflared
 * reports it, and stay alive until SIGINT/SIGTERM, then stop the tunnel.
 */
function runQuickTunnel(port: number, token: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn("cloudflared", quickTunnelArgs(port), {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let announced = false;
    const onLine = (line: string): void => {
      if (announced) {
        return;
      }
      const url = parseTunnelUrl(line);
      if (!url) {
        return;
      }
      announced = true;
      const publicUrl = tokenizedUrl(url, token);
      process.stdout.write("\n");
      ok("Public tunnel is up.");
      process.stdout.write(
        `\n  ${color.bold("Open from anywhere:")} ${color.cyan(publicUrl)}\n\n`,
      );
      warn("This URL grants shell access. Share it with no one. Ctrl+C tears it down.");
      dim("If the token may have leaked, run `mc rotate-token` after stopping.");
      process.stdout.write("\n");
    };

    // cloudflared prints the URL banner to stderr; watch both streams.
    for (const stream of [child.stdout, child.stderr]) {
      const rl = createInterface({ input: stream });
      rl.on("line", onLine);
    }

    child.on("error", (e) => {
      err(`failed to launch cloudflared: ${e.message}`);
      resolve();
    });

    let shuttingDown = false;
    const stop = (signal: string): void => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      process.stdout.write(`\nReceived ${signal}, tearing down the tunnel...\n`);
      child.kill("SIGTERM");
    };
    process.on("SIGINT", () => stop("SIGINT"));
    process.on("SIGTERM", () => stop("SIGTERM"));

    child.on("close", (code) => {
      if (!shuttingDown && !announced) {
        warn(`cloudflared exited (code ${code ?? "?"}) before a tunnel URL appeared.`);
      }
      resolve();
    });
  });
}

export async function runTunnel(): Promise<void> {
  const skipConfirm = process.argv.includes("--yes") || process.argv.includes("-y");
  const port = resolvedPort();

  printSecurityWarning(port);

  const cloudflared = await findCloudflared();
  if (!cloudflared) {
    dim(INSTALL_HELP);
    process.stdout.write("\n");
    return;
  }

  if (!skipConfirm) {
    const proceed = await confirm();
    if (!proceed) {
      process.stdout.write("\nAborted. No tunnel opened.\n");
      return;
    }
  }

  // Read the token the daemon is using (same resolution order as the daemon).
  const home = resolveHome();
  const token = resolveToken(home);

  process.stdout.write("\nStarting Cloudflare quick tunnel (Ctrl+C to stop)...\n");
  await runQuickTunnel(port, token);
}

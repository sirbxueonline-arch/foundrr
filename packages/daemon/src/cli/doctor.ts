/**
 * `mc doctor` — a green/red preflight checklist for the daemon's environment.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { DEFAULT_PORT } from "../constants.js";
import { color, dim, homeDir } from "./util.js";

const execFileAsync = promisify(execFile);

const MIN_NODE_MAJOR = 20;

interface CheckResult {
  pass: boolean;
  label: string;
  detail?: string;
}

function line(r: CheckResult): void {
  const mark = r.pass ? color.green("PASS") : color.red("FAIL");
  const detail = r.detail ? ` ${color.dim(`(${r.detail})`)}` : "";
  process.stdout.write(`  [${mark}] ${r.label}${detail}\n`);
}

function checkNode(): CheckResult {
  const raw = process.versions.node;
  const major = Number.parseInt(raw.split(".")[0] ?? "0", 10);
  return {
    pass: major >= MIN_NODE_MAJOR,
    label: `Node >= ${MIN_NODE_MAJOR}`,
    detail: `found ${raw}`,
  };
}

async function checkClaude(): Promise<CheckResult> {
  try {
    const { stdout } = await execFileAsync("claude", ["--version"], {
      timeout: 5000,
    });
    return { pass: true, label: "claude on PATH", detail: stdout.trim() };
  } catch {
    return {
      pass: false,
      label: "claude on PATH",
      detail: "not found (needed for the terminal's + Claude action)",
    };
  }
}

function checkHome(): CheckResult {
  const home = homeDir();
  const tokenPresent = existsSync(join(home, "token"));
  const homePresent = existsSync(home);
  return {
    pass: homePresent && tokenPresent,
    label: "home dir + token",
    detail: homePresent
      ? tokenPresent
        ? home
        : `${home} (token missing — run "mc start" once)`
      : `${home} (missing)`,
  };
}

async function checkPort(): Promise<CheckResult> {
  const url = `http://127.0.0.1:${DEFAULT_PORT}/healthz`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      return { pass: true, label: `port ${DEFAULT_PORT}`, detail: "daemon running" };
    }
    return { pass: true, label: `port ${DEFAULT_PORT}`, detail: `responded ${res.status}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      return { pass: true, label: `port ${DEFAULT_PORT}`, detail: "free" };
    }
    return { pass: false, label: `port ${DEFAULT_PORT}`, detail: msg };
  }
}

function checkHooksInstalled(): CheckResult {
  const path = join(homedir(), ".claude", "settings.json");
  if (!existsSync(path)) {
    return { pass: false, label: "hooks installed", detail: "no settings.json" };
  }
  try {
    const raw = readFileSync(path, "utf8");
    const present = raw.includes(join("hook", "dist", "hook.mjs"));
    return {
      pass: present,
      label: "hooks installed",
      detail: present ? "found in settings.json" : 'run "mc hooks install"',
    };
  } catch (e) {
    return {
      pass: false,
      label: "hooks installed",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function checkNodePty(): Promise<CheckResult> {
  try {
    await import("@homebridge/node-pty-prebuilt-multiarch");
    return { pass: true, label: "node-pty loadable" };
  } catch (e) {
    return {
      pass: false,
      label: "node-pty loadable",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

function checkTelemetry(): CheckResult {
  // Report only — are the OTel vars set in the CURRENT env? (Claude Code reads
  // them from its own env / ~/.claude/settings.json, not necessarily here.)
  const enabled = process.env["CLAUDE_CODE_ENABLE_TELEMETRY"] === "1";
  const endpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  const exporter = process.env["OTEL_METRICS_EXPORTER"];
  const configured = enabled && Boolean(endpoint) && exporter === "otlp";
  return {
    pass: configured,
    label: "telemetry env",
    detail: configured
      ? `enabled → ${endpoint}`
      : 'OTel vars not set here — run "mc telemetry enable"',
  };
}

function checkWebBuild(): CheckResult {
  const here = dirname(fileURLToPath(import.meta.url));
  const packagesDir = join(here, "..", "..", "..");
  const indexPath = join(packagesDir, "web", "dist", "index.html");
  const present = existsSync(indexPath);
  return {
    pass: present,
    label: "web build present",
    detail: present ? "packages/web/dist" : "not built yet",
  };
}

export async function runDoctor(): Promise<void> {
  process.stdout.write(`\n${color.bold("Mission Control — doctor")}\n\n`);

  const results: CheckResult[] = [
    checkNode(),
    await checkClaude(),
    checkHome(),
    await checkPort(),
    checkHooksInstalled(),
    checkTelemetry(),
    await checkNodePty(),
    checkWebBuild(),
  ];

  for (const r of results) {
    line(r);
  }

  const failed = results.filter((r) => !r.pass).length;
  process.stdout.write("\n");
  if (failed === 0) {
    process.stdout.write(`${color.green("All checks passed.")}\n`);
  } else {
    dim(`${failed} check(s) need attention.`);
  }
}

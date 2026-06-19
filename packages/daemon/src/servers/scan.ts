/**
 * Cross-platform listening-TCP-port scanner.
 *
 * Detects listening ports + the owning pid, dedupes by port, resolves each
 * pid's command line, guesses the framework, and fills the bind address.
 *
 * Unix tiers, tried in order — first that yields rows wins:
 *   1. `ss -ltnp`                        (Linux, fast)
 *   2. `lsof -nP -iTCP -sTCP:LISTEN`     (macOS/Linux)
 *   3. dependency-free /proc/net parser  (Linux only)
 *
 * Windows: `netstat -ano -p tcp` + PowerShell Get-CimInstance for the command.
 *
 * Never throws: any tier that errors returns [] (or is skipped), and the whole
 * scan resolves to [] on total failure rather than propagating up the stack.
 */
import { exec } from "node:child_process";
import { readdir, readFile, readlink } from "node:fs/promises";
import { promisify } from "node:util";

import type { DetectedServer } from "@mission-control/shared";

import { COMMAND_MAX, SCAN_COMMAND_TIMEOUT_MS } from "../constants.js";
import { guessFramework } from "./frameworks.js";

const execAsync = promisify(exec);

/** /proc/net/tcp state code for LISTEN. */
const PROC_STATE_LISTEN = "0A";

/** A raw listener observation before pid command resolution. */
interface RawListener {
  readonly port: number;
  readonly pid: number;
  readonly address: string;
}

function log(message: string): void {
  process.stderr.write(`[servers/scan] ${message}\n`);
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Run a command, returning stdout or "" on any failure (never throws). */
async function runCommand(command: string): Promise<string> {
  try {
    const { stdout } = await execAsync(command, {
      timeout: SCAN_COMMAND_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (err) {
    // ENOENT (tool absent), non-zero exit, or timeout — all benign here.
    log(`command failed: ${command} — ${describe(err)}`);
    return "";
  }
}

/** Truncate an over-long command line for storage/display. */
function clampCommand(command: string): string {
  const trimmed = command.trim();
  return trimmed.length > COMMAND_MAX ? `${trimmed.slice(0, COMMAND_MAX)}…` : trimmed;
}

// ─── Tier 1: ss -ltnp (Linux) ────────────────────────────────────────────────

/** Parse a `ss -ltnp` LISTEN row into a RawListener, or null if unparseable. */
function parseSsLine(line: string): RawListener | null {
  // Example:
  // LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=1234,fd=23))
  if (!line.startsWith("LISTEN")) {
    return null;
  }
  const cols = line.trim().split(/\s+/);
  // cols[3] is the local addr:port (index can vary; find the first addr:port col)
  const localAddr = cols[3];
  if (!localAddr) {
    return null;
  }
  const parsed = splitAddressPort(localAddr);
  if (!parsed) {
    return null;
  }
  const pidMatch = /pid=(\d+)/.exec(line);
  const pid = pidMatch ? Number.parseInt(pidMatch[1] as string, 10) : 0;
  return { port: parsed.port, address: parsed.address, pid };
}

async function scanSs(): Promise<RawListener[]> {
  const stdout = await runCommand("ss -ltnp");
  if (!stdout.trim()) {
    return [];
  }
  const listeners: RawListener[] = [];
  for (const line of stdout.split("\n")) {
    const parsed = parseSsLine(line);
    if (parsed) {
      listeners.push(parsed);
    }
  }
  return listeners;
}

// ─── Tier 2: lsof (macOS/Linux) ──────────────────────────────────────────────

/** Parse `lsof -nP -iTCP -sTCP:LISTEN` output (the macOS/Linux tier). */
function parseLsof(stdout: string): RawListener[] {
  const listeners: RawListener[] = [];
  for (const line of stdout.split("\n")) {
    // Example:
    // node    1234 kaan   23u  IPv4 0x...  0t0  TCP 127.0.0.1:3000 (LISTEN)
    if (!line.includes("(LISTEN)")) {
      continue;
    }
    const cols = line.trim().split(/\s+/);
    const pid = Number.parseInt(cols[1] ?? "", 10);
    if (Number.isNaN(pid)) {
      continue;
    }
    // The NAME column holds the address; it's the token just before "(LISTEN)".
    const listenIdx = cols.indexOf("(LISTEN)");
    const nameToken = listenIdx > 0 ? cols[listenIdx - 1] : undefined;
    if (!nameToken) {
      continue;
    }
    const parsed = splitAddressPort(nameToken);
    if (!parsed) {
      continue;
    }
    listeners.push({ port: parsed.port, address: parsed.address, pid });
  }
  return listeners;
}

async function scanLsof(): Promise<RawListener[]> {
  const stdout = await runCommand("lsof -nP -iTCP -sTCP:LISTEN");
  if (!stdout.trim()) {
    return [];
  }
  return parseLsof(stdout);
}

// ─── Tier 3: /proc/net parser (Linux only, dependency-free) ──────────────────

/** Parse a hex "addr:port" field from /proc/net/tcp into address + port. */
function parseProcHexEndpoint(field: string): { address: string; port: number } | null {
  const [hexAddr, hexPort] = field.split(":");
  if (!hexAddr || !hexPort) {
    return null;
  }
  const port = Number.parseInt(hexPort, 16);
  if (Number.isNaN(port)) {
    return null;
  }
  // The address is little-endian hex; we only need a readable label, not exact
  // dotted form, so 0.0.0.0 vs specific is approximated. Keep it simple.
  if (hexAddr === "00000000" || /^0+$/.test(hexAddr)) {
    return { address: "0.0.0.0", port };
  }
  if (hexAddr.length === 8) {
    // IPv4: 4 little-endian bytes.
    const bytes = [
      hexAddr.slice(6, 8),
      hexAddr.slice(4, 6),
      hexAddr.slice(2, 4),
      hexAddr.slice(0, 2),
    ].map((b) => Number.parseInt(b, 16));
    return { address: bytes.join("."), port };
  }
  // IPv6 or unknown — label generically; the port is what matters.
  return { address: "::", port };
}

/** Parse /proc/net/tcp(6), returning LISTEN inode→(port,address) entries. */
function parseProcNetTcp(content: string): Map<string, { port: number; address: string }> {
  const byInode = new Map<string, { port: number; address: string }>();
  const lines = content.split("\n");
  for (let i = 1; i < lines.length; i += 1) {
    const cols = (lines[i] ?? "").trim().split(/\s+/);
    // cols: sl local_address rem_address st ... uid timeout inode
    const localField = cols[1];
    const state = cols[3];
    const inode = cols[9];
    if (!localField || state !== PROC_STATE_LISTEN || !inode) {
      continue;
    }
    const endpoint = parseProcHexEndpoint(localField);
    if (endpoint) {
      byInode.set(inode, endpoint);
    }
  }
  return byInode;
}

/** Build an inode→pid map by scanning /proc/<pid>/fd socket symlinks. */
async function buildInodePidMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  let pidDirs: string[];
  try {
    pidDirs = await readdir("/proc");
  } catch {
    return map;
  }
  for (const dir of pidDirs) {
    const pid = Number.parseInt(dir, 10);
    if (Number.isNaN(pid)) {
      continue;
    }
    let fds: string[];
    try {
      fds = await readdir(`/proc/${dir}/fd`);
    } catch {
      // Process may have died, or we lack permission — skip it.
      continue;
    }
    for (const fd of fds) {
      try {
        const target = await readlink(`/proc/${dir}/fd/${fd}`);
        const match = /^socket:\[(\d+)\]$/.exec(target);
        if (match?.[1]) {
          map.set(match[1], pid);
        }
      } catch {
        // Symlink raced away — ignore.
      }
    }
  }
  return map;
}

async function scanProcNet(): Promise<RawListener[]> {
  const listeners: RawListener[] = [];
  const byInode = new Map<string, { port: number; address: string }>();
  for (const path of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    try {
      const content = await readFile(path, "utf8");
      for (const [inode, endpoint] of parseProcNetTcp(content)) {
        byInode.set(inode, endpoint);
      }
    } catch {
      // /proc absent (macOS) or unreadable — skip this file gracefully.
    }
  }
  if (byInode.size === 0) {
    return [];
  }
  const inodePid = await buildInodePidMap();
  for (const [inode, endpoint] of byInode) {
    listeners.push({
      port: endpoint.port,
      address: endpoint.address,
      pid: inodePid.get(inode) ?? 0,
    });
  }
  return listeners;
}

// ─── Windows: netstat -ano + Get-CimInstance ─────────────────────────────────

/** Parse `netstat -ano -p tcp` LISTENING rows. */
function parseNetstat(stdout: string): RawListener[] {
  const listeners: RawListener[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.includes("LISTENING")) {
      continue;
    }
    // Example:  TCP    127.0.0.1:3000    0.0.0.0:0    LISTENING    1234
    const cols = trimmed.split(/\s+/);
    // cols: [proto, local, foreign, state, pid]
    if (cols.length < 5) {
      continue;
    }
    const local = cols[1];
    const pid = Number.parseInt(cols[cols.length - 1] ?? "", 10);
    if (!local || Number.isNaN(pid)) {
      continue;
    }
    const parsed = splitAddressPort(local);
    if (parsed) {
      listeners.push({ port: parsed.port, address: parsed.address, pid });
    }
  }
  return listeners;
}

async function scanNetstat(): Promise<RawListener[]> {
  const stdout = await runCommand("netstat -ano -p tcp");
  return stdout.trim() ? parseNetstat(stdout) : [];
}

// ─── Address parsing shared across tiers ─────────────────────────────────────

/**
 * Split an "addr:port" token into address + port. Handles IPv6 forms like
 * `[::1]:3000`, `*:8080`, `127.0.0.1:3000`, and bare `:::3000` / `::1.3000`.
 */
function splitAddressPort(token: string): { address: string; port: number } | null {
  // IPv6 with brackets: [::1]:3000
  const bracket = /^\[(.*)\]:(\d+)$/.exec(token);
  if (bracket) {
    return { address: bracket[1] || "::", port: Number.parseInt(bracket[2] as string, 10) };
  }
  // Last colon separates port from address (covers bare IPv6 like :::3000).
  const lastColon = token.lastIndexOf(":");
  if (lastColon < 0) {
    return null;
  }
  const portStr = token.slice(lastColon + 1);
  const port = Number.parseInt(portStr, 10);
  if (Number.isNaN(port)) {
    return null;
  }
  let address = token.slice(0, lastColon);
  if (address === "*" || address === "" || address === "::") {
    address = address === "::" ? "::" : "0.0.0.0";
  }
  return { address, port };
}

// ─── Per-pid command resolution (cached within a scan) ───────────────────────

/** Resolve a pid's command line on Unix via `ps`. Empty string on failure. */
async function resolveUnixCommand(pid: number): Promise<string> {
  if (pid <= 0) {
    return "";
  }
  const stdout = await runCommand(`ps -p ${pid} -o command=`);
  return clampCommand(stdout.split("\n")[0] ?? "");
}

/** Resolve a pid's command line on Windows via Get-CimInstance. */
async function resolveWindowsCommand(pid: number): Promise<string> {
  if (pid <= 0) {
    return "";
  }
  const ps =
    `powershell -NoProfile -Command "(Get-CimInstance Win32_Process ` +
    `-Filter \\"ProcessId=${pid}\\").CommandLine"`;
  const stdout = await runCommand(ps);
  return clampCommand(stdout.split("\n")[0] ?? "");
}

/**
 * Resolve commands for a set of pids, caching each lookup so a pid that owns
 * multiple ports is only queried once.
 */
async function resolveCommands(
  pids: readonly number[],
  resolver: (pid: number) => Promise<string>,
): Promise<Map<number, string>> {
  const cache = new Map<number, string>();
  for (const pid of pids) {
    if (cache.has(pid)) {
      continue;
    }
    cache.set(pid, await resolver(pid));
  }
  return cache;
}

// ─── Orchestration ───────────────────────────────────────────────────────────

/**
 * Dedupe raw listeners by port. First occurrence wins, except a pid-less entry
 * is upgraded when a later observation of the same port carries a real pid
 * (e.g. IPv4 + IPv6 rows for one server).
 */
function dedupeByPort(listeners: readonly RawListener[]): RawListener[] {
  const byPort = new Map<number, RawListener>();
  for (const listener of listeners) {
    if (listener.port < 1) {
      continue;
    }
    const existing = byPort.get(listener.port);
    if (!existing) {
      byPort.set(listener.port, listener);
      continue;
    }
    if (existing.pid === 0 && listener.pid > 0) {
      byPort.set(listener.port, listener);
    }
  }
  return [...byPort.values()];
}

/** Run the Unix tiers in order; the first that returns rows wins. */
async function scanUnix(): Promise<RawListener[]> {
  const ss = await scanSs();
  if (ss.length > 0) {
    return ss;
  }
  const lsof = await scanLsof();
  if (lsof.length > 0) {
    return lsof;
  }
  return scanProcNet();
}

/**
 * Scan all listening TCP ports and return enriched, port-deduped servers.
 * Never throws — returns [] on total failure.
 */
export async function scanListening(): Promise<DetectedServer[]> {
  try {
    const isWindows = process.platform === "win32";
    const raw = isWindows ? await scanNetstat() : await scanUnix();
    const deduped = dedupeByPort(raw).filter((l) => l.port >= 1 && l.pid >= 0);

    const pids = deduped.map((l) => l.pid).filter((pid) => pid > 0);
    const resolver = isWindows ? resolveWindowsCommand : resolveUnixCommand;
    const commands = await resolveCommands(pids, resolver);

    return deduped
      .filter((l) => l.pid !== 0)
      .map((l): DetectedServer => {
        const command = commands.get(l.pid) ?? "";
        return {
          port: l.port,
          pid: l.pid,
          address: l.address,
          command,
          framework: guessFramework(command),
        };
      })
      .sort((a, b) => a.port - b.port);
  } catch (err) {
    log(`scan failed: ${describe(err)}`);
    return [];
  }
}

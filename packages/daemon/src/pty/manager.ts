/**
 * PtyManager — owns every pseudo-terminal the daemon spawns and bridges PTY
 * output to attached WebSocket clients.
 *
 * node-pty is a native CJS module. It is loaded lazily via a dynamic import
 * inside a try/catch so a load failure NEVER crashes the daemon: instead
 * `available` stays false and `loadError` holds the exact error to surface in
 * the terminal panel (brief §6: degrade gracefully).
 *
 * Ptys outlive their sockets: closing a socket only detaches it. A pty is freed
 * on its own exit, on `kill(id)`, or when the daemon shuts down.
 */
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";

import type { TerminalTabInfo } from "@mission-control/shared";

import {
  TERM_DEFAULT_COLS,
  TERM_DEFAULT_ROWS,
  TERM_MIN_COLS,
  TERM_MIN_ROWS,
  TERM_SCROLLBACK_MAX,
} from "../constants.js";

/** Minimal structural view of the node-pty module we depend on. */
interface PtyProcess {
  readonly pid: number;
  onData(listener: (data: string | Buffer) => void): unknown;
  onExit(listener: (e: { exitCode: number; signal?: number }) => void): unknown;
  resize(cols: number, rows: number): void;
  write(data: string): void;
  kill(signal?: string): void;
}

interface PtyModule {
  spawn(
    file: string,
    args: string[] | string,
    options: {
      name?: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: Record<string, string | undefined>;
      encoding?: string | null;
    },
  ): PtyProcess;
}

/** A receiver of PTY output. We type only what we use to avoid coupling to ws. */
export interface TermSocket {
  send(data: string | Buffer): void;
}

interface PtyEntry {
  readonly proc: PtyProcess;
  readonly info: TerminalTabInfo;
  readonly sockets: Set<TermSocket>;
  /** Ring buffer of recent raw output bytes, capped at TERM_SCROLLBACK_MAX. */
  scrollback: Buffer;
  /** Epoch ms of the last input or output activity. Drives quick-reply target. */
  lastActivityAt: number;
}

const NODE_PTY_MODULE = "@homebridge/node-pty-prebuilt-multiarch";
const TERM_NAME = "xterm-256color";

export interface CreateOptions {
  /** "claude" launches the Claude CLI; anything else falls back to a shell. */
  readonly shell?: string;
  /** Absolute working directory; validated to exist, else the home dir. */
  readonly cwd?: string;
}

export class PtyManager {
  private module: PtyModule | null = null;
  private loaded = false;
  private _available = false;
  private _loadError: string | null = null;

  private readonly entries = new Map<string, PtyEntry>();

  /** Whether node-pty loaded successfully. Valid after `ensureLoaded()`. */
  get available(): boolean {
    return this._available;
  }

  /** The exact load error string when `available` is false, else null. */
  get loadError(): string | null {
    return this._loadError;
  }

  /**
   * Lazily import node-pty once. Caches the result. Never throws: on failure it
   * records `loadError` and leaves `available` false.
   */
  async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    try {
      const mod = (await import(NODE_PTY_MODULE)) as unknown as
        | PtyModule
        | { default?: PtyModule };
      const resolved =
        typeof (mod as PtyModule).spawn === "function"
          ? (mod as PtyModule)
          : (mod as { default?: PtyModule }).default;
      if (!resolved || typeof resolved.spawn !== "function") {
        throw new Error("node-pty loaded but exposes no spawn()");
      }
      this.module = resolved;
      this._available = true;
      this._loadError = null;
    } catch (err) {
      this._available = false;
      this._loadError = describe(err);
    }
  }

  /** Whether a pty with this id currently exists. */
  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Open terminal tabs, so a full page reload can restore tab ids. */
  list(): TerminalTabInfo[] {
    return [...this.entries.values()].map((entry) => entry.info);
  }

  /**
   * Create a new pty for `id` and return its tab info. Throws if node-pty is
   * unavailable or spawning fails — callers must guard and surface the error.
   */
  create(id: string, options: CreateOptions): TerminalTabInfo {
    if (!this.module) {
      throw new Error(this._loadError ?? "terminal backend unavailable");
    }
    if (this.entries.has(id)) {
      const existing = this.entries.get(id);
      if (existing) {
        return existing.info;
      }
    }

    const { file, args, label } = resolveShell(options.shell);
    const cwd = resolveCwd(options.cwd);

    const proc = this.module.spawn(file, args, {
      name: TERM_NAME,
      // Spawn at a generous default so a full-screen TUI renders correctly
      // before the client's first fit arrives. The client resizes to the real
      // viewport on connect.
      cols: TERM_DEFAULT_COLS,
      rows: TERM_DEFAULT_ROWS,
      cwd,
      // Raw bytes so scrollback is byte-accurate and fan-out is binary.
      encoding: null,
      env: { ...process.env, TERM: TERM_NAME },
    });

    const info: TerminalTabInfo = {
      id,
      title: label,
      cwd,
      shell: options.shell === "claude" ? "claude" : file,
      createdAt: Date.now(),
    };

    const entry: PtyEntry = {
      proc,
      info,
      sockets: new Set<TermSocket>(),
      scrollback: Buffer.alloc(0),
      lastActivityAt: Date.now(),
    };
    this.entries.set(id, entry);

    proc.onData((data) => {
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
      entry.lastActivityAt = Date.now();
      this.appendScrollback(entry, chunk);
      this.fanOut(entry, chunk);
    });

    proc.onExit(({ exitCode }) => {
      const frame = controlFrame({ t: "exit", code: exitCode });
      for (const socket of entry.sockets) {
        sendSafe(socket, frame);
      }
      this.entries.delete(id);
    });

    return info;
  }

  /** Attach a socket to an existing pty so it receives live output. */
  attach(id: string, socket: TermSocket): void {
    this.entries.get(id)?.sockets.add(socket);
  }

  /** Detach a socket (e.g. on close). Does NOT kill the pty. */
  detach(id: string, socket: TermSocket): void {
    this.entries.get(id)?.sockets.delete(socket);
  }

  /** Write keystrokes to a pty. No-op if it is gone. */
  write(id: string, data: string): void {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }
    entry.lastActivityAt = Date.now();
    entry.proc.write(data);
  }

  /**
   * The id of the most-recently-active pty we own, or undefined if none exist.
   * "Active" = the last keystroke we forwarded or output we received. Used to
   * pick a target for a Telegram quick-reply.
   */
  mostRecentlyActiveId(): string | undefined {
    let bestId: string | undefined;
    let bestTs = -1;
    for (const [id, entry] of this.entries) {
      if (entry.lastActivityAt > bestTs) {
        bestTs = entry.lastActivityAt;
        bestId = id;
      }
    }
    return bestId;
  }

  /**
   * Inject a line of text as if typed into the most-recently-active pty,
   * submitting it with a carriage return. Returns true if a pty received it.
   *
   * HONEST LIMITATION: this can only reach ptys Mission Control spawned (the
   * dashboard's Terminal tabs). It cannot inject into external `claude` sessions
   * the user runs in their own terminal — those are observed via hooks only,
   * with no input channel back to them.
   */
  injectPrompt(text: string): boolean {
    const id = this.mostRecentlyActiveId();
    if (!id) {
      return false;
    }
    this.write(id, `${text}\r`);
    return true;
  }

  /**
   * Resize a pty. No-op if it is gone or the dimensions are invalid.
   *
   * Defense in depth: a request below the sane minimum (cols<2 / rows<2) is the
   * fingerprint of a hidden or unlaid-out client container — FitAddon clamps
   * cols to 1 when clientWidth is 0. We IGNORE such a request rather than apply
   * it, so a stray tiny resize can never wedge the PTY at one column (which made
   * a full-screen TUI render one character per line).
   */
  resize(id: string, cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows)) {
      return;
    }
    if (cols < TERM_MIN_COLS || rows < TERM_MIN_ROWS) {
      return;
    }
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }
    try {
      // node-pty signature is resize(cols, rows) — columns first.
      entry.proc.resize(cols, rows);
    } catch {
      // ConPTY/winpty can throw on odd sizes — ignore, never crash.
    }
  }

  /** Terminate a pty and free it. The onExit handler removes the entry. */
  kill(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }
    try {
      entry.proc.kill();
    } catch {
      // Already dead — drop it ourselves.
      this.entries.delete(id);
    }
  }

  /** Current scrollback bytes for a pty (empty if none). Replayed on connect. */
  getScrollback(id: string): Buffer {
    return this.entries.get(id)?.scrollback ?? Buffer.alloc(0);
  }

  /** Kill every pty (daemon shutdown). */
  killAll(): void {
    for (const id of [...this.entries.keys()]) {
      this.kill(id);
    }
  }

  /** Append output to the ring buffer, trimming from the front on overflow. */
  private appendScrollback(entry: PtyEntry, chunk: Buffer): void {
    const combined = Buffer.concat([entry.scrollback, chunk]);
    entry.scrollback =
      combined.length > TERM_SCROLLBACK_MAX
        ? combined.subarray(combined.length - TERM_SCROLLBACK_MAX)
        : combined;
  }

  /** Push a binary chunk to all attached sockets; drop dead ones. */
  private fanOut(entry: PtyEntry, chunk: Buffer): void {
    for (const socket of entry.sockets) {
      if (!sendSafe(socket, chunk)) {
        entry.sockets.delete(socket);
      }
    }
  }
}

/** Build a 0x00-prefixed control frame: Buffer([0]) + UTF-8 JSON. */
export function controlFrame(obj: unknown): Buffer {
  return Buffer.concat([
    Buffer.from([0]),
    Buffer.from(JSON.stringify(obj), "utf8"),
  ]);
}

interface ResolvedShell {
  file: string;
  args: string[];
  label: string;
}

/** Resolve the launch command: "claude" → the CLI, else the user's shell. */
function resolveShell(shell: string | undefined): ResolvedShell {
  if (shell === "claude") {
    return { file: "claude", args: [], label: "claude" };
  }
  const file =
    process.env["SHELL"] ??
    (process.platform === "win32" ? "powershell.exe" : "/bin/bash");
  return { file, args: [], label: file };
}

/** Resolve cwd: a provided directory that exists, else the home dir. */
function resolveCwd(cwd: string | undefined): string {
  if (cwd && cwd.trim().length > 0) {
    try {
      if (existsSync(cwd) && statSync(cwd).isDirectory()) {
        return cwd;
      }
    } catch {
      // Fall through to home dir.
    }
  }
  return homedir();
}

/** Send to a socket, swallowing errors. Returns false if the send failed. */
function sendSafe(socket: TermSocket, data: string | Buffer): boolean {
  try {
    socket.send(data);
    return true;
  } catch {
    return false;
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

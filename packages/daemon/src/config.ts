/**
 * Daemon configuration. Resolves home dir, access token, port/host, and db path.
 * Pure aside from the home-dir/token side effects (creating the dir, persisting
 * a generated token).
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  TOKEN_BYTES,
  TOKEN_FILE_MODE,
} from "./constants.js";

export interface Config {
  readonly home: string;
  readonly token: string;
  readonly port: number;
  readonly host: string;
  readonly dbPath: string;
}

/** Resolve the Mission Control home directory ($MC_HOME || ~/.mission-control). */
export function resolveHome(): string {
  const fromEnv = process.env["MC_HOME"];
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv;
  }
  return join(homedir(), ".mission-control");
}

function ensureHome(home: string): void {
  if (!existsSync(home)) {
    mkdirSync(home, { recursive: true });
  }
}

/**
 * Resolve the access token, in priority order:
 *   1. $MC_TOKEN
 *   2. <home>/token file contents
 *   3. freshly generated 32-byte hex token, persisted to <home>/token (0600).
 */
export function resolveToken(home: string): string {
  const fromEnv = process.env["MC_TOKEN"];
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  const tokenPath = join(home, "token");
  if (existsSync(tokenPath)) {
    try {
      const existing = readFileSync(tokenPath, "utf8").trim();
      if (existing.length > 0) {
        return existing;
      }
    } catch (err) {
      process.stderr.write(
        `[config] failed to read token file, regenerating: ${describeError(err)}\n`,
      );
    }
  }

  const generated = randomBytes(TOKEN_BYTES).toString("hex");
  try {
    writeFileSync(tokenPath, generated, { mode: TOKEN_FILE_MODE });
  } catch (err) {
    process.stderr.write(
      `[config] failed to persist generated token: ${describeError(err)}\n`,
    );
  }
  return generated;
}

/**
 * Generate a fresh 32-byte hex token and persist it to `<home>/token` (0600),
 * replacing any existing token. Returns the new token. Used by `mc rotate-token`
 * to revoke an exposed token. Throws if the write fails (caller surfaces it).
 */
export function rotateToken(home: string): string {
  ensureHome(home);
  const tokenPath = join(home, "token");
  const generated = randomBytes(TOKEN_BYTES).toString("hex");
  writeFileSync(tokenPath, generated, { mode: TOKEN_FILE_MODE });
  return generated;
}

function resolvePort(): number {
  const raw = process.env["PORT"];
  if (!raw) {
    return DEFAULT_PORT;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    process.stderr.write(
      `[config] invalid PORT="${raw}", falling back to ${DEFAULT_PORT}\n`,
    );
    return DEFAULT_PORT;
  }
  return parsed;
}

function resolveHost(): string {
  const raw = process.env["HOST"];
  return raw && raw.trim().length > 0 ? raw.trim() : DEFAULT_HOST;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Load a frozen Config, creating the home dir and token as needed. */
export function loadConfig(): Config {
  const home = resolveHome();
  ensureHome(home);
  const token = resolveToken(home);
  const port = resolvePort();
  const host = resolveHost();
  const dbPath = join(home, "mc.db");

  return Object.freeze({ home, token, port, host, dbPath });
}

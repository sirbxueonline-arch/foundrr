/**
 * Tiny dependency-free ANSI helpers and printers for the CLI.
 */
import { homedir } from "node:os";
import { join } from "node:path";

const useColor = process.stdout.isTTY && !process.env["NO_COLOR"];

/** ESC char (0x1b); built at runtime to avoid embedding a raw control byte. */
const ESC = String.fromCharCode(27);
const RESET = `${ESC}[0m`;

function wrap(code: string, s: string): string {
  return useColor ? `${ESC}[${code}m${s}${RESET}` : s;
}

export const color = {
  green: (s: string): string => wrap("32", s),
  red: (s: string): string => wrap("31", s),
  yellow: (s: string): string => wrap("33", s),
  cyan: (s: string): string => wrap("36", s),
  dim: (s: string): string => wrap("2", s),
  bold: (s: string): string => wrap("1", s),
};

export function ok(msg: string): void {
  process.stdout.write(`${color.green("OK")} ${msg}\n`);
}

export function warn(msg: string): void {
  process.stdout.write(`${color.yellow("!")} ${msg}\n`);
}

export function err(msg: string): void {
  process.stderr.write(`${color.red("x")} ${msg}\n`);
}

export function dim(msg: string): void {
  process.stdout.write(`${color.dim(msg)}\n`);
}

/** Mission Control home dir ($MC_HOME || ~/.mission-control). */
export function homeDir(): string {
  const fromEnv = process.env["MC_HOME"];
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv;
  }
  return join(homedir(), ".mission-control");
}

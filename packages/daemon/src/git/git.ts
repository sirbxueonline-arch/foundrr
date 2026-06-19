/**
 * Guarded git operations for Mission Control (M4).
 *
 * SECURITY: every git invocation runs in a client-supplied `cwd`. We use
 * `execFile("git", [...args])` with an argument ARRAY — never `shell: true`,
 * never string interpolation of user input — so paths, branch names, commit
 * messages, and file arguments can never break out into a shell. `cwd`,
 * `message`, and `file` are all treated as untrusted; `cwd` is validated to be
 * an absolute path to an existing directory inside a git work tree before any
 * mutating op.
 *
 * `runGit` never throws on a non-zero git exit — it returns the result so each
 * caller decides what a non-zero code means. It throws only when the process
 * fails to spawn (e.g. git missing) or times out.
 */
import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import type { GitFileChange, GitStatus } from "@mission-control/shared";

import { GIT_CMD_TIMEOUT_MS, GIT_DIFF_MAX } from "../constants.js";

/** Result of a single git invocation. `code` is null if killed by a signal. */
export interface GitResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunGitOptions {
  readonly timeoutMs?: number;
}

/** Max bytes captured from a single git invocation before it is killed. */
const GIT_MAX_BUFFER = 16 * 1024 * 1024;

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Run `git <args>` in `cwd` with no shell. Resolves with the captured result
 * on any exit code (including non-zero). Rejects only on spawn failure/timeout.
 */
export function runGit(
  cwd: string,
  args: readonly string[],
  options: RunGitOptions = {},
): Promise<GitResult> {
  const timeout = options.timeoutMs ?? GIT_CMD_TIMEOUT_MS;
  return new Promise((resolvePromise, reject) => {
    execFile(
      "git",
      [...args],
      {
        cwd,
        timeout,
        maxBuffer: GIT_MAX_BUFFER,
        windowsHide: true,
        encoding: "utf8",
      },
      (err, stdout, stderr) => {
        // execFile passes an Error on non-zero exit; we only treat a missing
        // `code` (spawn failure / timeout / signal kill) as a real throw.
        const errno = err as (NodeJS.ErrnoException & { code?: unknown }) | null;
        if (errno && typeof errno.code !== "number" && errno.code !== null) {
          reject(new Error(`git failed: ${describe(err)}`));
          return;
        }
        const code =
          errno && typeof errno.code === "number" ? errno.code : err ? 1 : 0;
        resolvePromise({ code, stdout, stderr });
      },
    );
  });
}

/**
 * Validate that `cwd` is a usable absolute directory path. Throws an Error
 * tagged so routes can map it to 400. Does NOT check repo membership.
 */
export function assertValidCwd(cwd: unknown): string {
  if (typeof cwd !== "string" || cwd.trim().length === 0) {
    throw new BadCwdError("cwd is required");
  }
  if (!isAbsolute(cwd)) {
    throw new BadCwdError("cwd must be an absolute path");
  }
  // Resolve to collapse any `..` segments before touching the filesystem.
  const resolved = resolve(cwd);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new BadCwdError("cwd does not exist or is not a directory");
  }
  return resolved;
}

/** Thrown for malformed `cwd` input — routes map this to HTTP 400. */
export class BadCwdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadCwdError";
  }
}

/** Thrown when `cwd` is valid but not inside a git work tree — maps to 409. */
export class NotARepoError extends Error {
  constructor(message = "cwd is not inside a git work tree") {
    super(message);
    this.name = "NotARepoError";
  }
}

/** True if `cwd` is inside a git work tree. */
export async function isRepo(cwd: string): Promise<boolean> {
  try {
    const result = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return result.code === 0 && result.stdout.trim() === "true";
  } catch {
    return false;
  }
}

/** Validate cwd AND confirm it is a git work tree, or throw a tagged error. */
async function requireRepo(cwd: unknown): Promise<string> {
  const valid = assertValidCwd(cwd);
  if (!(await isRepo(valid))) {
    throw new NotARepoError();
  }
  return valid;
}

// ─── status ──────────────────────────────────────────────────────────────────

/**
 * Parse `git status --porcelain=v1 -b -z` output into a GitStatus.
 *
 * The `-z` form is NUL-delimited, which is the only robust way to handle paths
 * containing spaces or newlines. The first record is the branch header
 * (`## a...b [ahead N, behind M]`); the rest are `XY<space>path` records, with
 * renames carrying a second NUL-separated origin path we skip past.
 */
export function parsePorcelainV1(raw: string): {
  branch: string;
  ahead: number;
  behind: number;
  files: GitFileChange[];
} {
  const records = raw.split("\0");
  let branch = "";
  let ahead = 0;
  let behind = 0;
  const files: GitFileChange[] = [];

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (record === undefined || record.length === 0) {
      continue;
    }
    if (record.startsWith("## ")) {
      const header = parseBranchHeader(record.slice(3));
      branch = header.branch;
      ahead = header.ahead;
      behind = header.behind;
      continue;
    }
    // Entry form: "XY path" where XY is the two-char status code.
    const status = record.slice(0, 2);
    const path = record.slice(3);
    const indexCol = status.charAt(0);
    const staged = indexCol !== " " && indexCol !== "?";
    files.push({ path, status, staged });
    // Rename/copy entries (R/C in the index column) carry the origin path as
    // the NEXT NUL-separated record — skip it so it is not parsed as an entry.
    if (indexCol === "R" || indexCol === "C") {
      i += 1;
    }
  }

  return { branch, ahead, behind, files };
}

/** Parse the `## branch...upstream [ahead N, behind M]` header body. */
function parseBranchHeader(body: string): {
  branch: string;
  ahead: number;
  behind: number;
} {
  const aheadMatch = /ahead (\d+)/.exec(body);
  const behindMatch = /behind (\d+)/.exec(body);
  const ahead = aheadMatch ? Number.parseInt(aheadMatch[1] as string, 10) : 0;
  const behind = behindMatch ? Number.parseInt(behindMatch[1] as string, 10) : 0;

  // Fresh repo before the first commit: "## No commits yet on <branch>".
  const noCommits = /No commits yet on (.+)/.exec(body);
  if (noCommits) {
    return { branch: (noCommits[1] as string).trim(), ahead, behind };
  }

  // Normal: "<branch>...<upstream> [ahead N, behind M]" or just "<branch>".
  const trackingSplit = body.indexOf("...");
  const beforeBracket = body.split(" [")[0] ?? body;
  const branch =
    trackingSplit >= 0 ? body.slice(0, trackingSplit) : beforeBracket.trim();
  return { branch: branch.trim(), ahead, behind };
}

/** Read the working-tree status of a repo. Throws on bad cwd / not a repo. */
export async function gitStatus(cwd: unknown): Promise<GitStatus> {
  const repo = await requireRepo(cwd);
  const result = await runGit(repo, [
    "status",
    "--porcelain=v1",
    "-b",
    "-z",
  ]);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "git status failed");
  }
  const parsed = parsePorcelainV1(result.stdout);
  return {
    cwd: repo,
    branch: parsed.branch,
    ahead: parsed.ahead,
    behind: parsed.behind,
    clean: parsed.files.length === 0,
    files: parsed.files,
  };
}

// ─── diff ──────────────────────────────────────────────────────────────────

export interface DiffOptions {
  readonly file?: string;
  readonly staged?: boolean;
}

export interface DiffResult {
  readonly diff: string;
  readonly truncated: boolean;
}

/** Cap diff text at GIT_DIFF_MAX, appending a truncation note when clipped. */
function capDiff(text: string): DiffResult {
  if (text.length <= GIT_DIFF_MAX) {
    return { diff: text, truncated: false };
  }
  const note = `\n\n[diff truncated at ${GIT_DIFF_MAX} chars]\n`;
  return { diff: text.slice(0, GIT_DIFF_MAX) + note, truncated: true };
}

/** True if a path is reported as untracked (`??`) in the current status. */
async function isUntracked(repo: string, file: string): Promise<boolean> {
  const status = await gitStatus(repo);
  return status.files.some((f) => f.path === file && f.status === "??");
}

/**
 * Produce a unified diff for the working tree (or the index when `staged`),
 * optionally scoped to one `file`. Untracked files have no tracked baseline, so
 * we fall back to `git diff --no-index /dev/null <file>` (best-effort); on
 * Windows we skip the /dev/null trick and return a synthetic "new file" note.
 */
export async function gitDiff(
  cwd: unknown,
  options: DiffOptions = {},
): Promise<DiffResult> {
  const repo = await requireRepo(cwd);
  const { file, staged } = options;

  if (file && !staged && (await isUntracked(repo, file))) {
    return capDiff(await diffUntracked(repo, file));
  }

  const args = ["diff"];
  if (staged) {
    args.push("--cached");
  }
  if (file) {
    args.push("--", file);
  }
  const result = await runGit(repo, args);
  // `git diff` exits 0 with no changes; exit 1 here would be unusual but the
  // stdout still holds whatever diff text was produced, so we return it.
  return capDiff(result.stdout);
}

/** Best-effort diff of an untracked file against an empty baseline. */
async function diffUntracked(repo: string, file: string): Promise<string> {
  if (process.platform === "win32") {
    return `new file: ${file}\n(untracked; full diff not shown on Windows)\n`;
  }
  // --no-index exits 1 when files differ — that is the normal, expected case.
  const result = await runGit(repo, [
    "diff",
    "--no-index",
    "--",
    "/dev/null",
    file,
  ]);
  return result.stdout || `new file: ${file}\n`;
}

// ─── commit ──────────────────────────────────────────────────────────────────

export interface CommitResult {
  readonly committed: boolean;
  readonly output: string;
}

/**
 * Stage everything (`git add -A`) then `git commit -m <message>`. If there is
 * nothing to commit, git exits non-zero with a "nothing to commit" message; we
 * surface that as `committed: false` rather than throwing. Empty messages are
 * rejected at the route, but we guard here too.
 */
export async function gitCommit(
  cwd: unknown,
  message: string,
): Promise<CommitResult> {
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new BadCwdError("commit message must not be empty");
  }
  const repo = await requireRepo(cwd);

  const add = await runGit(repo, ["add", "-A"]);
  if (add.code !== 0) {
    throw new Error(add.stderr.trim() || "git add failed");
  }

  // `-m <message>` as a discrete arg — never interpolated into a shell string.
  const commit = await runGit(repo, ["commit", "-m", message]);
  const output = (commit.stdout + commit.stderr).trim();
  if (commit.code !== 0) {
    // "nothing to commit" / "no changes added" → not an error, just no-op.
    if (/nothing to commit|no changes added|nothing added/i.test(output)) {
      return { committed: false, output };
    }
    throw new Error(output || "git commit failed");
  }
  return { committed: true, output };
}

// ─── discard ─────────────────────────────────────────────────────────────────

/**
 * Discard UNCOMMITTED changes. Destructive, but scoped strictly to the working
 * tree and index — it never rewrites committed history.
 *
 *   With a file:
 *     - untracked (`??`): the file is deleted from disk.
 *     - tracked: `git restore --staged --worktree -- <file>` (unstage + revert).
 *   Without a file (discard ALL):
 *     - `git restore --staged --worktree .` reverts tracked changes, then
 *       `git clean -fd` removes untracked files and directories.
 */
export async function gitDiscard(cwd: unknown, file?: string): Promise<void> {
  const repo = await requireRepo(cwd);

  if (file && file.trim().length > 0) {
    if (await isUntracked(repo, file)) {
      await rm(resolve(repo, file), { force: true });
      return;
    }
    const restore = await runGit(repo, [
      "restore",
      "--staged",
      "--worktree",
      "--",
      file,
    ]);
    if (restore.code !== 0) {
      throw new Error(restore.stderr.trim() || "git restore failed");
    }
    return;
  }

  const restore = await runGit(repo, ["restore", "--staged", "--worktree", "."]);
  if (restore.code !== 0) {
    throw new Error(restore.stderr.trim() || "git restore failed");
  }
  const clean = await runGit(repo, ["clean", "-fd"]);
  if (clean.code !== 0) {
    throw new Error(clean.stderr.trim() || "git clean failed");
  }
}

/**
 * Git routes (M4 — all token-protected):
 *   GET  /api/git/status?cwd=<abs>                       — GitStatus
 *   GET  /api/git/diff?cwd=<abs>&file=<path?>&staged=0|1 — { diff, truncated }
 *   POST /api/git/commit   body { cwd, message }         — { ok, committed, output }
 *   POST /api/git/discard  body { cwd, file? }           — { ok } (DESTRUCTIVE)
 *
 * `cwd`, `file`, and `message` are untrusted client input. The git layer runs
 * everything via execFile with an argument array (no shell), so none of it can
 * be injected. Each handler is wrapped: 400 on bad input, 409 when the path is
 * not a git work tree, 500 otherwise. Never throws out.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { ApiError } from "@mission-control/shared";

import {
  BadCwdError,
  NotARepoError,
  gitCommit,
  gitDiff,
  gitDiscard,
  gitStatus,
} from "../../git/git.js";
import type { AppContext } from "../context.js";
import { requireToken } from "../auth.js";

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function badRequest(reply: FastifyReply, message: string): FastifyReply {
  const body: ApiError = { error: message };
  return reply.code(400).send(body);
}

/** Map a thrown error to the right status: 400 bad input, 409 not-a-repo, 500. */
function handleError(reply: FastifyReply, err: unknown): FastifyReply {
  const body: ApiError = { error: describe(err) };
  if (err instanceof BadCwdError) {
    return reply.code(400).send(body);
  }
  if (err instanceof NotARepoError) {
    return reply.code(409).send(body);
  }
  return reply.code(500).send(body);
}

/** Read a string query param, or undefined if absent/blank. */
function queryString(req: FastifyRequest, key: string): string | undefined {
  const value = (req.query as Record<string, unknown> | undefined)?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function registerGitRoute(app: FastifyInstance, ctx: AppContext): void {
  const guard = { preHandler: requireToken(ctx.config.token) };

  app.get("/api/git/status", guard, async (req: FastifyRequest, reply) => {
    try {
      return await gitStatus(queryString(req, "cwd"));
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.get("/api/git/diff", guard, async (req: FastifyRequest, reply) => {
    try {
      const cwd = queryString(req, "cwd");
      const file = queryString(req, "file");
      const staged = queryString(req, "staged") === "1";
      return await gitDiff(cwd, { file, staged });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.post("/api/git/commit", guard, async (req: FastifyRequest, reply) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const cwd = body["cwd"];
      const message = body["message"];
      if (typeof message !== "string" || message.trim().length === 0) {
        return badRequest(reply, "message must not be empty");
      }
      const result = await gitCommit(cwd, message);
      return { ok: true, committed: result.committed, output: result.output };
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.post("/api/git/discard", guard, async (req: FastifyRequest, reply) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const cwd = body["cwd"];
      const rawFile = body["file"];
      const file =
        typeof rawFile === "string" && rawFile.trim().length > 0
          ? rawFile
          : undefined;
      await gitDiscard(cwd, file);
      return { ok: true };
    } catch (err) {
      return handleError(reply, err);
    }
  });
}

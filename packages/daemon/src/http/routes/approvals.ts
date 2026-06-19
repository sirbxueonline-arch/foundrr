/**
 * Approval routes — the remote-approve contract (M7).
 *
 * Hook-facing (the PreToolUse bridge in @mission-control/hook calls these):
 *   POST /approvals/evaluate  → { gated, requestId? }   (gate decision + mint)
 *   GET  /approvals/:id       → { state, reason? }       (poll for a decision)
 *
 * Dashboard-facing:
 *   GET  /api/approvals             → ApprovalRequest[]  (active list)
 *   POST /api/approvals/:id/decision → { ok: true }      (approve/deny from UI)
 *
 * All routes require the token (the hook sends x-mc-token). Every handler is
 * wrapped so a failure NEVER throws out of the route — in particular a Telegram
 * send failure must not prevent returning the requestId, since the dashboard
 * can still resolve the approval.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { ApiError } from "@mission-control/shared";

import { isGated } from "../../approvals/policy.js";
import { getTelegram } from "../../db/telegram-repo.js";
import { projectFromCwd } from "../../events/describe.js";
import type { AppContext } from "../context.js";
import { requireToken } from "../auth.js";

interface EvaluateBody {
  sessionId?: unknown;
  toolName?: unknown;
  toolInput?: unknown;
  cwd?: unknown;
}

interface DecisionBody {
  decision?: unknown;
  reason?: unknown;
}

/** Coerce an unknown to a non-empty string, else undefined. */
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Coerce an unknown to a tool_input record, else undefined. */
function record(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)
    : undefined;
}

export function registerApprovalsRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  const guard = { preHandler: requireToken(ctx.config.token) };

  // ── Hook: gate decision + mint a pending request ──────────────────────────
  app.post(
    "/approvals/evaluate",
    guard,
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = (req.body ?? {}) as EvaluateBody;
        const toolName = str(body.toolName);
        const toolInput = record(body.toolInput);

        const gate = isGated(toolName, toolInput);
        if (!gate.gated) {
          return reply.send({ gated: false });
        }

        // Only engage the gate when a remote approver actually exists. The
        // leash is for *remote* supervision: until a Telegram chat is linked,
        // nobody can tap Approve/Deny from away, so gating would just stall
        // every Bash/edit for ~50s before falling back to the local prompt —
        // exactly the at-keyboard friction we want to avoid. With no linked
        // chat we report "not gated" so Claude Code's normal local permission
        // flow handles it instantly. Link Telegram (`mc telegram setup` +
        // `/link`) and the gate engages as configured.
        const linked = Boolean(getTelegram(ctx.db).chatId);
        if (!linked) {
          return reply.send({ gated: false });
        }

        const sessionId = str(body.sessionId) ?? "unknown";
        const cwd = str(body.cwd);
        const project = projectFromCwd(cwd);

        const approval = ctx.approvalStore.create({
          sessionId,
          project,
          toolName: toolName ?? "tool",
          summary: gate.summary,
          detail: gate.detail,
        });

        // Fire-and-forget the Telegram push. A failure here must NOT prevent
        // us returning the requestId — the dashboard can still resolve it.
        void ctx.telegram.sendApproval(approval).catch(() => {
          /* swallowed inside sendApproval too; double-guard */
        });

        return reply.send({ gated: true, requestId: approval.id });
      } catch (err) {
        req.log.error({ err }, "approvals/evaluate failed");
        // Fail safe: tell the hook "not gated" so it defers to the local prompt
        // rather than polling a request that was never created.
        return reply.send({ gated: false });
      }
    },
  );

  // ── Hook: poll for a decision ─────────────────────────────────────────────
  app.get(
    "/approvals/:id",
    guard,
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = req.params as { id: string };
        // Unknown ids map to "expired" so a race (swept out of memory) resolves
        // cleanly — the hook treats "expired" as a clean defer, not a retry.
        return reply.send(ctx.approvalStore.stateOf(id));
      } catch (err) {
        req.log.error({ err }, "approvals/:id failed");
        return reply.send({ state: "expired" });
      }
    },
  );

  // ── Dashboard: active list ────────────────────────────────────────────────
  app.get("/api/approvals", guard, async (_req, reply) => {
    try {
      return reply.send(ctx.approvalStore.listActive());
    } catch (err) {
      _req.log.error({ err }, "api/approvals failed");
      const body: ApiError = { error: "internal error" };
      return reply.code(500).send(body);
    }
  });

  // ── Dashboard: approve/deny ───────────────────────────────────────────────
  app.post(
    "/api/approvals/:id/decision",
    guard,
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = req.params as { id: string };
        const body = (req.body ?? {}) as DecisionBody;
        const decision = body.decision;
        if (decision !== "allow" && decision !== "deny") {
          const errBody: ApiError = {
            error: 'decision must be "allow" or "deny"',
          };
          return reply.code(400).send(errBody);
        }
        const reason = str(body.reason);
        ctx.approvalStore.resolve(id, decision, "dashboard", reason);
        return reply.send({ ok: true });
      } catch (err) {
        req.log.error({ err }, "api/approvals decision failed");
        const body: ApiError = { error: "internal error" };
        return reply.code(500).send(body);
      }
    },
  );
}

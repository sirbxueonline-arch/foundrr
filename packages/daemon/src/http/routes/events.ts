/**
 * POST /events — Claude Code hook ingest. Token-protected. Validates the body
 * at the boundary, ingests via the EventHub, and replies 204. Never throws.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { ApiError, HookEventName, IncomingHookEvent } from "@mission-control/shared";

import type { AppContext } from "../context.js";
import { requireToken } from "../auth.js";

const KNOWN_EVENTS: ReadonlySet<HookEventName> = new Set<HookEventName>([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
  "SubagentStop",
  "SessionEnd",
  "PreCompact",
]);

interface ValidationResult {
  ok: boolean;
  event?: IncomingHookEvent;
  error?: string;
}

/** Validate an unknown body into an IncomingHookEvent. */
function validate(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const record = body as Record<string, unknown>;
  const sessionId = record["session_id"];
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return { ok: false, error: "session_id (string) is required" };
  }
  const eventName = record["hook_event_name"];
  if (typeof eventName !== "string" || !KNOWN_EVENTS.has(eventName as HookEventName)) {
    return { ok: false, error: "hook_event_name is missing or unknown" };
  }
  return { ok: true, event: record as unknown as IncomingHookEvent };
}

export function registerEventsRoute(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.post(
    "/events",
    { preHandler: requireToken(ctx.config.token) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = validate(req.body);
        if (!result.ok || !result.event) {
          const body: ApiError = { error: result.error ?? "invalid event" };
          return reply.code(400).send(body);
        }
        ctx.eventHub.ingest(result.event);
        return reply.code(204).send();
      } catch (err) {
        req.log.error({ err }, "events ingest failed");
        const body: ApiError = { error: "internal error" };
        return reply.code(500).send(body);
      }
    },
  );
}

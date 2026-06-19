/**
 * Build the Fastify app: websocket plugin, routes (events/sessions/health),
 * the WS /stream route, and static serving with SPA fallback. Routes are
 * registered before static so they win over the catch-all.
 */
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";

import { registerOtelRoute } from "../otel/receiver.js";
import { registerStreamRoute } from "../ws/stream.js";
import { registerTermRoute } from "../ws/term.js";
import type { AppContext } from "./context.js";
import { registerAccessRoutes } from "./routes/access.js";
import { registerApprovalsRoutes } from "./routes/approvals.js";
import { registerEventsRoute } from "./routes/events.js";
import { registerGitRoute } from "./routes/git.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerServersRoute } from "./routes/servers.js";
import { registerSessionsRoute } from "./routes/sessions.js";
import { registerTelegramRoute } from "./routes/telegram.js";
import { registerTerminalRoute } from "./routes/terminal.js";
import { registerStatic } from "./static.js";

/** Build and return a fully-wired Fastify instance (not yet listening). */
export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env["MC_LOG_LEVEL"] ?? "info" },
    bodyLimit: 1_048_576, // 1 MiB — hook payloads are small.
  });

  await app.register(fastifyWebsocket);

  // API + ingest + stream (registered before static so they take precedence).
  registerHealthRoute(app);
  registerEventsRoute(app, ctx);
  registerSessionsRoute(app, ctx);
  registerServersRoute(app, ctx);
  registerTerminalRoute(app, ctx);
  registerGitRoute(app, ctx);
  // Remote approve (M7): hook-facing /approvals/* + dashboard /api/approvals.
  // Token-protected; declared paths so they win over the SPA/static fallback.
  registerApprovalsRoutes(app, ctx);
  // Telegram link status — dashboard away-surface indicator (token-protected).
  registerTelegramRoute(app, ctx);
  // "Access from anywhere" panel — addresses + managed tunnel (token-protected).
  registerAccessRoutes(app, ctx);
  // OTLP cost/token receiver — PUBLIC (no token); see otel/receiver.ts.
  registerOtelRoute(app, ctx);
  registerStreamRoute(app, ctx);
  registerTermRoute(app, ctx);

  // Static assets + SPA fallback (also installs the / token gate + 404 handler).
  registerStatic(app, ctx);

  return app;
}

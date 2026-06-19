/**
 * POST /v1/metrics — OTLP metrics receiver for Claude Code's OpenTelemetry
 * exporter. Runs on the daemon's OWN port (no second bind); Claude Code is
 * pointed here via OTEL_EXPORTER_OTLP_ENDPOINT (see `mc telemetry enable`).
 *
 * AUTH: this route is intentionally PUBLIC (no token). Claude Code's OTLP
 * exporter will not send our access token, and the daemon is loopback-bound by
 * default. It is exempt exactly like /healthz: we simply never attach the
 * requireToken preHandler, and the global token gate in http/static.ts only
 * guards "/" and "/index.html". Adding the token here would force Claude Code's
 * exporter to log perpetual 401s, so we accept anonymous localhost pushes.
 *
 * RESILIENCE: we only understand application/json (OTEL_EXPORTER_OTLP_PROTOCOL=
 * http/json). For protobuf or any unparseable body we reply 200 {} and skip,
 * rather than 500 — a non-200 makes Claude Code's exporter log errors. We
 * ALWAYS reply 200.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AppContext } from "../http/context.js";
import { parseOtlpMetrics } from "./parse.js";

/** True when the content-type indicates a JSON body we can parse. */
function isJsonContentType(contentType: string | undefined): boolean {
  if (!contentType) {
    // Default OTLP/JSON exporters set application/json; if absent, try anyway.
    return true;
  }
  return contentType.toLowerCase().includes("json");
}

/** Feed parsed per-session increments into the CostStore. */
function ingestIntoStore(ctx: AppContext, body: unknown): void {
  const { costBySession, tokensBySession } = parseOtlpMetrics(body);
  for (const [sessionId, usd] of costBySession) {
    ctx.costStore.recordCost(sessionId, usd);
  }
  for (const [sessionId, tokens] of tokensBySession) {
    ctx.costStore.recordTokens(sessionId, tokens);
  }
}

export function registerOtelRoute(app: FastifyInstance, ctx: AppContext): void {
  // Register the receiver inside its own encapsulated plugin scope so the
  // wildcard content-type parser (below) does NOT leak to other routes. Without
  // this, Fastify rejects non-JSON bodies (e.g. protobuf) with 415 BEFORE our
  // handler runs — and a 415 makes Claude Code's exporter log errors. We want a
  // graceful 200 for anything that isn't JSON, so we accept any content-type and
  // simply discard non-JSON payloads.
  app.register((scope, _opts, done) => {
    // JSON bodies are parsed normally (the default JSON parser is inherited).
    // Everything else: read & drain the stream, hand back a sentinel so the
    // handler knows to skip parsing.
    scope.addContentTypeParser(
      "*",
      { parseAs: "buffer" },
      (_req, _payload, doneParse) => {
        // We never parse non-JSON bodies; pass undefined so req.body is empty.
        doneParse(null, undefined);
      },
    );

    scope.post(
      "/v1/metrics",
      async (req: FastifyRequest, reply: FastifyReply) => {
        try {
          const contentType = req.headers["content-type"];
          if (isJsonContentType(contentType)) {
            // application/json bodies are parsed into req.body by Fastify.
            ingestIntoStore(ctx, req.body);
          }
          // protobuf / unknown content-type → silently skip (still 200).
        } catch (err) {
          // Never surface an error to the exporter; just log and 200.
          req.log.debug({ err }, "otel metrics ingest skipped");
        }
        return reply.code(200).send({});
      },
    );

    done();
  });
}

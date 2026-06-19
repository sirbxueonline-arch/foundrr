/**
 * Static asset serving. Serves the built web app (packages/web/dist) from the
 * daemon. GET / requires a valid ?token= query; missing/invalid → a tiny 401
 * page telling the user to append the token. If the web build is absent, serves
 * a placeholder instead of crashing.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AppContext } from "./context.js";
import { extractToken, isValidToken } from "./auth.js";

const TOKEN_PROMPT_HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>Mission Control</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;background:#0d1014;color:#e6eaf0;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.card{max-width:32rem;padding:2rem;text-align:center;line-height:1.6}
code{color:#f2a23c}</style></head>
<body><div class="card"><h1>Mission Control</h1>
<p>Append <code>?token=YOUR_TOKEN</code> to the URL.</p>
<p>See the daemon startup log for your token.</p></div></body></html>`;

const PLACEHOLDER_HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>Mission Control</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;background:#0d1014;color:#e6eaf0;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.card{max-width:32rem;padding:2rem;text-align:center;line-height:1.6}
code{color:#f2a23c}</style></head>
<body><div class="card"><h1>Mission Control</h1>
<p>The daemon is running, but the web build was not found.</p>
<p>Build the web app: <code>npm run build -w @mission-control/web</code></p></div></body></html>`;

/** Resolve repo `packages/web/dist` relative to this compiled file. */
function resolveWebDist(): string {
  // Compiled location: packages/daemon/dist/http/static.js
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/http → dist → daemon → packages
  const packagesDir = join(here, "..", "..", "..");
  return join(packagesDir, "web", "dist");
}

function sendHtml(reply: FastifyReply, code: number, html: string): void {
  reply.code(code).header("content-type", "text/html; charset=utf-8").send(html);
}

function isProtectedPath(url: string): boolean {
  const path = url.split("?")[0] ?? "";
  return path === "/" || path === "/index.html";
}

/** Register static serving + SPA fallback. Public for assets; / needs a token. */
export function registerStatic(app: FastifyInstance, ctx: AppContext): void {
  const webDist = resolveWebDist();
  const hasBuild = existsSync(join(webDist, "index.html"));

  // Gate the index/root behind a token before static serving handles it.
  app.addHook("onRequest", (req: FastifyRequest, reply: FastifyReply, done) => {
    if (req.method === "GET" && isProtectedPath(req.url)) {
      if (!isValidToken(extractToken(req), ctx.config.token)) {
        sendHtml(reply, 401, TOKEN_PROMPT_HTML);
        return;
      }
    }
    done();
  });

  if (!hasBuild) {
    app.log.warn(
      `[static] web build not found at ${webDist}; serving placeholder`,
    );
    app.get("/", async (_req, reply) => {
      sendHtml(reply, 200, PLACEHOLDER_HTML);
    });
    return;
  }

  app.register(fastifyStatic, { root: webDist, wildcard: false });

  // SPA fallback: serve index.html for GET non-/api, non-/events, non-/stream
  // routes; otherwise return JSON 404.
  app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split("?")[0] ?? "";
    const isApi =
      path.startsWith("/api") ||
      path === "/events" ||
      path === "/stream" ||
      path === "/healthz" ||
      path === "/v1/metrics";
    if (req.method === "GET" && !isApi) {
      reply.sendFile("index.html");
      return;
    }
    reply.code(404).send({ error: "not found" });
  });
}

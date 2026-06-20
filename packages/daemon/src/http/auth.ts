/**
 * Token authentication. Tokens may arrive via ?token= query, x-mc-token header,
 * an Authorization: Bearer header, or the `mc_token` cookie. Comparison is
 * constant-time.
 *
 * The cookie exists for the path-mounted preview proxy: a previewed page loads
 * its own sub-resources (`/__preview/<port>/assets/…`) WITHOUT a `?token=` query,
 * so the first authenticated navigation sets a path-scoped cookie and every
 * subsequent proxied request authenticates by it. See preview/http.ts.
 */
import { timingSafeEqual } from "node:crypto";

import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";

import type { ApiError } from "@mission-control/shared";

/** The cookie name used to carry the access token for preview sub-resources. */
export const TOKEN_COOKIE = "mc_token";

/**
 * Read the `mc_token` value out of a raw Cookie header, or undefined if absent.
 * Tolerant of surrounding whitespace and URL-encoding; ignores other cookies.
 */
export function tokenFromCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== TOKEN_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    if (value.length === 0) return undefined;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

/** Extract a token from the request, or undefined if none supplied. */
export function extractToken(req: FastifyRequest): string | undefined {
  const query = req.query as Record<string, unknown> | undefined;
  const fromQuery = query?.["token"];
  if (typeof fromQuery === "string" && fromQuery.length > 0) {
    return fromQuery;
  }

  const headerToken = req.headers["x-mc-token"];
  if (typeof headerToken === "string" && headerToken.length > 0) {
    return headerToken;
  }

  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    const bearer = auth.slice("Bearer ".length).trim();
    if (bearer.length > 0) {
      return bearer;
    }
  }

  // Cookie fallback — primarily for preview-proxy sub-resources (see above).
  return tokenFromCookie(req.headers["cookie"]);
}

/** Constant-time token comparison guarded by length. */
export function isValidToken(
  token: string | undefined,
  configToken: string,
): boolean {
  if (!token || token.length !== configToken.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(configToken));
  } catch {
    return false;
  }
}

/** Build a Fastify preHandler that 401s on a missing/invalid token. */
export function requireToken(configToken: string): preHandlerHookHandler {
  return function preHandler(
    req: FastifyRequest,
    reply: FastifyReply,
    done: (err?: Error) => void,
  ): void {
    const token = extractToken(req);
    if (!isValidToken(token, configToken)) {
      const body: ApiError = { error: "unauthorized" };
      reply.code(401).send(body);
      return;
    }
    done();
  };
}

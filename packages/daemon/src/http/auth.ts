/**
 * Token authentication. Tokens may arrive via ?token= query, x-mc-token header,
 * or an Authorization: Bearer header. Comparison is constant-time.
 */
import { timingSafeEqual } from "node:crypto";

import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";

import type { ApiError } from "@mission-control/shared";

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

  return undefined;
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

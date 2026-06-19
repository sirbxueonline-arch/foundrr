/**
 * WS /term — authenticated PTY bridge. One socket attaches to one pty (keyed by
 * `id`). On connect it create-or-attaches the pty, replays scrollback, then
 * pumps data both directions.
 *
 * Wire format (mirrored by the web client):
 *   - binaryType = "arraybuffer" on the client.
 *   - Control frame (both directions): BINARY frame, first byte 0x00, then
 *     UTF-8 JSON. client→server {t:"resize",cols,rows} | {t:"kill"};
 *     server→client {t:"error",message} | {t:"exit",code}.
 *   - Data: client→server keystrokes as a TEXT frame; server→client PTY output
 *     as BINARY frames (raw bytes).
 *
 * Closing the socket only detaches — the pty stays alive so a reconnecting phone
 * resumes mid-task. {t:"kill"} (or DELETE /api/term/:id) terminates it.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";

import { TERM_CONTROL_PREFIX } from "@mission-control/shared";

import type { AppContext } from "../http/context.js";
import { extractToken, isValidToken } from "../http/auth.js";
import { controlFrame } from "../pty/manager.js";

interface TermQuery {
  id?: string;
  shell?: string;
  cwd?: string;
}

export function registerTermRoute(app: FastifyInstance, ctx: AppContext): void {
  app.get(
    "/term",
    {
      websocket: true,
      onRequest: (req: FastifyRequest, reply, done) => {
        // Authenticate the upgrade before opening the socket (same as /stream).
        if (!isValidToken(extractToken(req), ctx.config.token)) {
          reply.code(401).send({ error: "unauthorized" });
          return;
        }
        done();
      },
    },
    (socket: WebSocket, req: FastifyRequest) => {
      void handleConnection(socket, req, ctx);
    },
  );
}

async function handleConnection(
  socket: WebSocket,
  req: FastifyRequest,
  ctx: AppContext,
): Promise<void> {
  const query = (req.query as TermQuery) ?? {};
  const id = typeof query.id === "string" ? query.id : "";
  if (id.length === 0) {
    sendSafe(socket, controlFrame({ t: "error", message: "missing tab id" }));
    closeSafe(socket);
    return;
  }

  const manager = ctx.ptyManager;
  await manager.ensureLoaded();

  // Degrade gracefully: surface the exact load error, do not throw.
  if (!manager.available) {
    sendSafe(
      socket,
      controlFrame({
        t: "error",
        message: manager.loadError ?? "terminal backend unavailable",
      }),
    );
    closeSafe(socket);
    return;
  }

  // Create-or-attach the pty for this id.
  if (!manager.has(id)) {
    try {
      manager.create(id, { shell: query.shell, cwd: query.cwd });
    } catch (err) {
      sendSafe(
        socket,
        controlFrame({ t: "error", message: describe(err) }),
      );
      closeSafe(socket);
      return;
    }
  }

  // Replay scrollback so a reconnecting client resumes mid-task.
  const scrollback = manager.getScrollback(id);
  if (scrollback.length > 0) {
    sendSafe(socket, scrollback);
  }

  manager.attach(id, socket);

  socket.on("message", (data: Buffer, isBinary: boolean) => {
    try {
      handleMessage(manager, id, data, isBinary);
    } catch {
      // Malformed frame — ignore, never crash.
    }
  });

  socket.on("close", () => manager.detach(id, socket));
  socket.on("error", () => manager.detach(id, socket));
}

/**
 * Route an inbound frame: binary frames beginning with 0x00 are control frames;
 * everything else is keystroke text written to the pty.
 */
function handleMessage(
  manager: AppContext["ptyManager"],
  id: string,
  data: Buffer,
  isBinary: boolean,
): void {
  if (isBinary && data.length > 0 && data[0] === TERM_CONTROL_PREFIX) {
    const json = data.subarray(1).toString("utf8");
    const frame = JSON.parse(json) as { t?: string; cols?: number; rows?: number };
    if (frame.t === "resize") {
      manager.resize(id, Number(frame.cols), Number(frame.rows));
    } else if (frame.t === "kill") {
      manager.kill(id);
    }
    return;
  }

  // Keystroke data — write to the pty as a string.
  manager.write(id, data.toString("utf8"));
}

function sendSafe(socket: WebSocket, data: string | Buffer): void {
  try {
    socket.send(data);
  } catch {
    // Client gone — ignore.
  }
}

function closeSafe(socket: WebSocket): void {
  try {
    socket.close();
  } catch {
    // Already closed — ignore.
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

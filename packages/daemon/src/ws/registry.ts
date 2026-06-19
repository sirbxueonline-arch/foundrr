/**
 * StreamRegistry — tracks live WebSocket clients and fans out StreamMessages.
 * Send errors and dead sockets are swallowed so one bad client can't crash a
 * broadcast.
 */
import type { WebSocket } from "ws";

import type { StreamMessage } from "@mission-control/shared";

export class StreamRegistry {
  private readonly sockets = new Set<WebSocket>();

  add(socket: WebSocket): void {
    this.sockets.add(socket);
  }

  delete(socket: WebSocket): void {
    this.sockets.delete(socket);
  }

  get size(): number {
    return this.sockets.size;
  }

  /** Serialize once and push to every open socket; ignore failures. */
  broadcast(msg: StreamMessage): void {
    let payload: string;
    try {
      payload = JSON.stringify(msg);
    } catch {
      return;
    }
    for (const socket of this.sockets) {
      // ws readyState OPEN === 1
      if (socket.readyState !== 1) {
        this.sockets.delete(socket);
        continue;
      }
      try {
        socket.send(payload);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }
}

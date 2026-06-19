/**
 * Terminal wire helpers — mirror the daemon's /term framing exactly.
 *
 * Framing (shared with the daemon via @mission-control/shared):
 *   - Control frames are BINARY: a leading TERM_CONTROL_PREFIX (0x00) byte
 *     followed by the UTF-8 of the JSON control object.
 *   - Everything else is raw PTY bytes:
 *       client → server : keystrokes, sent as TEXT
 *       server → client : output, arrives as BINARY (ArrayBuffer)
 */
import { TERM_CONTROL_PREFIX, type TermControlFrame } from "@mission-control/shared";
import { getToken } from "./token";

const encoder = new TextEncoder();

/**
 * Encode a control object as a binary frame: [0x00, ...utf8(JSON)].
 * Sent to the server with `ws.send(buildControl(obj))`.
 */
export function buildControl(obj: TermControlFrame): Uint8Array {
  const json = encoder.encode(JSON.stringify(obj));
  const frame = new Uint8Array(json.length + 1);
  frame[0] = TERM_CONTROL_PREFIX;
  frame.set(json, 1);
  return frame;
}

/**
 * Build the /term WebSocket URL for a given terminal id, shell, and cwd.
 * The token travels in the query string (the WS handshake can't set headers).
 */
export function termWsUrl(id: string, shell: string, cwd?: string): string {
  const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
  const token = getToken() ?? "";
  const cwdParam = encodeURIComponent(cwd ?? "");
  return (
    `${wsProto}://${window.location.host}/term` +
    `?id=${encodeURIComponent(id)}` +
    `&token=${encodeURIComponent(token)}` +
    `&shell=${encodeURIComponent(shell)}` +
    `&cwd=${cwdParam}`
  );
}

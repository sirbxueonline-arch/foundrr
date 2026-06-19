/**
 * useStream — opens the daemon's WebSocket event stream, parses StreamMessage
 * frames, and exposes the derived live state to the dashboard.
 *
 * State is kept as a Map keyed by sessionId so snapshot / session /
 * session_removed apply in O(1). Other message types (servers, approval,
 * approval_resolved, cost) are handled now where the shapes are known and
 * left as forward-compat no-ops where their UIs ship in later milestones.
 *
 * Reconnect uses capped exponential backoff and cleans up fully on unmount.
 */
import { useEffect, useRef, useState } from "react";
import type {
  AgentSession,
  ApprovalRequest,
  CostSnapshot,
  DetectedServer,
  StreamMessage,
} from "@mission-control/shared";
import { getToken } from "./token";

export type StreamStatus = "connecting" | "open" | "reconnecting";

export interface StreamState {
  sessions: AgentSession[];
  servers: DetectedServer[];
  approvals: ApprovalRequest[];
  cost: CostSnapshot | null;
  status: StreamStatus;
  /** Daemon clock from the latest snapshot, for clock-skew-aware rendering. */
  serverTime: number | null;
}

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;

function buildStreamUrl(token: string): string {
  const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${window.location.host}/stream?token=${encodeURIComponent(token)}`;
}

function safeParse(data: unknown): StreamMessage | null {
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as StreamMessage;
    if (parsed && typeof (parsed as { type?: unknown }).type === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function sortSessions(map: Map<string, AgentSession>): AgentSession[] {
  // Active-ish first, then most recently active.
  const weight: Record<string, number> = {
    active: 0,
    waiting: 1,
    error: 2,
    idle: 3,
    ended: 4,
  };
  return [...map.values()].sort((a, b) => {
    const w = (weight[a.status] ?? 5) - (weight[b.status] ?? 5);
    if (w !== 0) return w;
    return b.lastEventAt - a.lastEventAt;
  });
}

export function useStream(): StreamState {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [servers, setServers] = useState<DetectedServer[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [cost, setCost] = useState<CostSnapshot | null>(null);
  const [serverTime, setServerTime] = useState<number | null>(null);
  const [status, setStatus] = useState<StreamStatus>("connecting");

  // Mutable refs survive re-renders without re-triggering the effect.
  const sessionsRef = useRef<Map<string, AgentSession>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    const token = getToken();
    if (!token) return;

    const flushSessions = (): void => {
      setSessions(sortSessions(sessionsRef.current));
    };

    const applyMessage = (msg: StreamMessage): void => {
      switch (msg.type) {
        case "snapshot": {
          const next = new Map<string, AgentSession>();
          for (const s of msg.sessions) next.set(s.sessionId, s);
          sessionsRef.current = next;
          flushSessions();
          setServers(msg.servers);
          setApprovals(msg.approvals);
          setCost(msg.cost);
          setServerTime(msg.serverTime);
          break;
        }
        case "session": {
          sessionsRef.current.set(msg.session.sessionId, msg.session);
          flushSessions();
          break;
        }
        case "session_removed": {
          sessionsRef.current.delete(msg.sessionId);
          flushSessions();
          break;
        }
        case "servers": {
          setServers(msg.servers);
          break;
        }
        case "approval":
        case "approval_resolved": {
          // Upsert by id; full approvals UI arrives in M7.
          setApprovals((prev) => {
            const others = prev.filter((a) => a.id !== msg.approval.id);
            return [msg.approval, ...others];
          });
          break;
        }
        case "cost": {
          setCost(msg.cost);
          break;
        }
        default: {
          // Forward-compat: ignore unknown future message types.
          break;
        }
      }
    };

    const scheduleReconnect = (): void => {
      if (unmountedRef.current) return;
      const attempt = attemptsRef.current++;
      const delay = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      setStatus("reconnecting");
      reconnectTimer.current = setTimeout(connect, delay);
    };

    function connect(): void {
      if (unmountedRef.current) return;
      setStatus((prev) => (prev === "reconnecting" ? prev : "connecting"));

      let ws: WebSocket;
      try {
        ws = new WebSocket(buildStreamUrl(token as string));
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
        setStatus("open");
      };

      ws.onmessage = (ev) => {
        const msg = safeParse(ev.data);
        if (msg) applyMessage(msg);
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // Let onclose drive the reconnect; closing here avoids a dangling socket.
        try {
          ws.close();
        } catch {
          /* already closing */
        }
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      const ws = wsRef.current;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
    };
  }, []);

  return { sessions, servers, approvals, cost, status, serverTime };
}

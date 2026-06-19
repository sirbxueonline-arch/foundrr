/**
 * Terminal — one xterm.js view bridged to a daemon PTY over WS /term.
 *
 * Wire format (mirrors the daemon exactly, see lib/term.ts):
 *   - ws.binaryType = "arraybuffer".
 *   - Server → client: BINARY frames. If the first byte is TERM_CONTROL_PREFIX
 *     (0x00) the rest is JSON control ({t:"error"|"exit"}); otherwise it's raw
 *     PTY output written straight to the terminal.
 *   - Client → server: keystrokes go out as TEXT (term.onData → ws.send(d));
 *     control frames (resize) go out as BINARY (buildControl).
 *
 * Scrollback replay is handled by the daemon (it resends buffered bytes on
 * connect) — we just write whatever arrives.
 *
 * Resilience: a single automatic reconnect if the socket drops while the tab is
 * alive. Fit runs on mount, on a debounced ResizeObserver, and on window resize;
 * every fit emits a resize control frame so the PTY tracks the viewport — which
 * is what makes a mobile on-screen keyboard (which shrinks the visual viewport)
 * reflow correctly.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal as XTerm, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  TERM_CONTROL_PREFIX,
  TERM_MIN_COLS,
  TERM_MIN_ROWS,
} from "@mission-control/shared";
import "@xterm/xterm/css/xterm.css";
import { buildControl, termWsUrl } from "../lib/term";

interface TerminalProps {
  id: string;
  shell: string;
  cwd?: string;
  /**
   * Whether this terminal's tab is currently visible. Inactive tabs stay
   * mounted but hidden (display:none) so their socket and scrollback survive;
   * while hidden the container is 0×0 and must NOT drive a fit/resize. When this
   * flips false→true we refit so the PTY tracks the now-visible viewport.
   */
  active: boolean;
}

/**
 * Imperative surface a parent grabs via ref to drive this terminal without
 * touching its internals — used by the mobile keys/command bars.
 */
export interface TerminalHandle {
  /**
   * Write `data` to this terminal's PTY exactly as a typed keystroke would
   * (same TEXT-frame path as `term.onData`). Pass raw byte sequences, e.g.
   * "\x1b" for Esc or "\x1b[A" for the up arrow.
   */
  sendInput: (data: string) => void;
  /** Focus the xterm textarea so the on-screen keyboard opens / keys land here. */
  focus: () => void;
  /** Refit to the current container and push the new geometry to the PTY. */
  refit: () => void;
}

const RESIZE_DEBOUNCE_MS = 80;
const RECONNECT_DELAY_MS = 600;

/**
 * Telemetry-console theme built from the index.css palette tokens.
 * Background --void, foreground --text, cursor/selection in --signal/--cool,
 * the ANSI palette tuned for a calm dark console.
 */
const TELEMETRY_THEME: ITheme = {
  background: "#0d1014", // --void
  foreground: "#e6eaf0", // --text
  cursor: "#f2a23c", // --signal
  cursorAccent: "#0d1014", // --void (text under the block cursor)
  selectionBackground: "rgba(86, 182, 194, 0.3)", // --cool, translucent
  selectionForeground: "#e6eaf0", // --text
  black: "#151b23", // --panel
  red: "#e5645a", // --alert
  green: "#74c69d", // --ok
  yellow: "#f2a23c", // --signal
  blue: "#56b6c2", // --cool
  magenta: "#b794f4",
  cyan: "#56b6c2", // --cool
  white: "#8a95a3", // --muted
  brightBlack: "#5b6573", // --faint
  brightRed: "#e5645a",
  brightGreen: "#74c69d",
  brightYellow: "#f2a23c",
  brightBlue: "#56b6c2",
  brightMagenta: "#cbb2ff",
  brightCyan: "#7fd4de",
  brightWhite: "#e6eaf0", // --text
};

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal(
  { id, shell, cwd, active },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Holds the latest fit-and-resize so the activation effect can call it
  // without re-running the heavy setup effect. Assigned inside the setup effect.
  const fitRef = useRef<(() => void) | null>(null);
  // Live refs to the socket and xterm so the imperative handle can write input
  // and focus without re-running the heavy setup effect. Kept current there.
  const socketRef = useRef<WebSocket | null>(null);
  const termRef = useRef<XTerm | null>(null);

  // Imperative API for the mobile keys/command bars (see TerminalHandle).
  useImperativeHandle(
    ref,
    () => ({
      sendInput: (data: string): void => {
        const ws = socketRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(data);
          } catch {
            // Socket may have closed between the check and the send; ignored.
          }
        }
      },
      focus: (): void => {
        termRef.current?.focus();
      },
      refit: (): void => {
        fitRef.current?.();
      },
    }),
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let reconnectUsed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const term = new XTerm({
      // Honor the user's reduced-motion preference for the cursor.
      cursorBlink: !prefersReducedMotion,
      fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: TELEMETRY_THEME,
      scrollback: 10_000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    termRef.current = term;

    /** Keep the imperative-handle socket ref in lockstep with `socket`. */
    const setSocket = (next: WebSocket | null): void => {
      socket = next;
      socketRef.current = next;
    };

    /**
     * Whether the container is actually visible with real dimensions. An
     * inactive tab is hidden with display:none, which makes both clientWidth and
     * offsetParent report 0/null — fitting then yields cols≈0 (clamped to 1) and
     * would wedge the PTY at one column. Guard every fit on this.
     */
    const isContainerVisible = (): boolean =>
      container.offsetParent !== null &&
      container.clientWidth > 0 &&
      container.clientHeight > 0;

    /**
     * Fit to the container, then tell the PTY the new geometry — but only when
     * the container is visible and the computed size meets the sane minimum.
     * A hidden or unlaid-out container is skipped entirely so no bad resize
     * (cols=1) is ever sent; a later activation / resize event retries.
     */
    const fitAndResize = (): void => {
      if (disposed) return;
      if (!isContainerVisible()) return;
      try {
        fitAddon.fit();
      } catch {
        // Container not laid out yet (0×0). A later resize event retries.
        return;
      }
      const { cols, rows } = term;
      if (cols < TERM_MIN_COLS || rows < TERM_MIN_ROWS) {
        // Below the floor → the box isn't really laid out. Don't send.
        return;
      }
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(buildControl({ t: "resize", cols, rows }));
        } catch {
          // Socket may have closed between the check and the send; ignored.
        }
      }
    };
    fitRef.current = fitAndResize;

    const scheduleFit = (): void => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(fitAndResize, RESIZE_DEBOUNCE_MS);
    };

    /** Write a faint single-line status notice into the terminal. */
    const writeNotice = (text: string): void => {
      // \x1b[2m = dim, \x1b[36m = cyan-ish via theme, \x1b[0m = reset.
      term.writeln(`\x1b[2m${text}\x1b[0m`);
    };

    /** Decode and handle a server control frame. */
    const handleControl = (bytes: Uint8Array): void => {
      let frame: { t?: string; message?: string; code?: number };
      try {
        frame = JSON.parse(new TextDecoder().decode(bytes.slice(1)));
      } catch {
        return; // Malformed control frame — ignore rather than crash.
      }
      if (frame.t === "error") {
        // node-pty graceful-degrade path: show the load error IN the panel.
        term.writeln("");
        term.writeln(`\x1b[31m${frame.message ?? "terminal unavailable"}\x1b[0m`);
      } else if (frame.t === "exit") {
        term.writeln("");
        writeNotice(`[process exited: ${frame.code ?? 0}]`);
      }
    };

    const connect = (): void => {
      if (disposed) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(termWsUrl(id, shell, cwd));
      } catch {
        writeNotice("[connection failed]");
        return;
      }
      ws.binaryType = "arraybuffer";
      setSocket(ws);

      ws.onopen = () => {
        // Fit once the socket is up so the PTY starts at the right geometry.
        fitAndResize();
      };

      ws.onmessage = (ev: MessageEvent<ArrayBuffer | string>) => {
        if (typeof ev.data === "string") {
          // Daemon sends binary; tolerate any stray text frame as raw output.
          term.write(ev.data);
          return;
        }
        const bytes = new Uint8Array(ev.data);
        if (bytes.length === 0) return;
        if (bytes[0] === TERM_CONTROL_PREFIX) {
          handleControl(bytes);
        } else {
          term.write(bytes);
        }
      };

      ws.onclose = () => {
        if (socket === ws) setSocket(null);
        if (disposed) return;
        if (!reconnectUsed) {
          reconnectUsed = true;
          writeNotice("[reconnecting…]");
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        } else {
          writeNotice("[disconnected]");
        }
      };

      ws.onerror = () => {
        // Let onclose drive reconnect; closing avoids a dangling socket.
        try {
          ws.close();
        } catch {
          /* already closing */
        }
      };
    };

    // Keystrokes → server as TEXT.
    const dataSub = term.onData((d) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(d);
      }
    });

    // Observe container size (covers flex/layout reflow and mobile keyboard).
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(container);
    window.addEventListener("resize", scheduleFit);

    // A display:none → block transition does not reliably fire ResizeObserver,
    // so watch intersection too: when the panel becomes visible, refit on the
    // next frame (after layout settles) so the PTY tracks the real viewport.
    const intersectionObserver = new IntersectionObserver((entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      if (visible) requestAnimationFrame(fitAndResize);
    });
    intersectionObserver.observe(container);

    // Initial fit before the socket opens so xterm has real geometry, then
    // connect (onopen does the authoritative fit + resize frame).
    fitAndResize();
    connect();

    return () => {
      disposed = true;
      fitRef.current = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", scheduleFit);
      observer.disconnect();
      intersectionObserver.disconnect();
      dataSub.dispose();
      const ws = socket;
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
        setSocket(null);
      }
      termRef.current = null;
      term.dispose();
    };
  }, [id, shell, cwd]);

  // When this tab becomes active (hidden → visible), the container gains real
  // dimensions. Refit on the next frame — after the display:block has taken
  // effect and layout has settled — so the PTY is resized away from any stale
  // hidden-state geometry to the now-visible viewport. Skipped while inactive
  // (the fit guard would no-op anyway, but this avoids needless work).
  useEffect(() => {
    if (!active) return;
    const raf = requestAnimationFrame(() => {
      fitRef.current?.();
    });
    return () => cancelAnimationFrame(raf);
  }, [active]);

  // Clicking anywhere in the panel focuses the terminal so a mobile on-screen
  // keyboard opens and key events land in xterm.
  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
      style={{ backgroundColor: "var(--color-void)", padding: "6px" }}
      role="group"
      aria-label={`Terminal ${shell}`}
      onClick={() => termRef.current?.focus()}
    />
  );
});

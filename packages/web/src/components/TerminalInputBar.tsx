/**
 * TerminalInputBar — the mobile-first input affordances for a terminal.
 *
 * A phone keyboard can't send the control bytes Claude's TUI relies on (Esc,
 * Tab, arrows, Ctrl-C/D/Z) and is fiddly to bring up. This renders two things
 * under the active terminal:
 *
 *   1. A compact, horizontally-scrollable special-keys bar. Each button sends
 *      an exact byte sequence to the PTY via the terminal's imperative ref
 *      (same path as a real keystroke), so "Esc" really sends \x1b, etc.
 *   2. A single-line command bar: type a prompt/command, Send (or Enter) writes
 *      it to the PTY followed by a carriage return, then clears. Configured so a
 *      phone treats it as plain shell text (no autocapitalize/correct/spellcheck)
 *      while native voice-to-text still works.
 *
 * It is intentionally tasteful on desktop too. Buttons are ~40px tall for
 * comfortable touch targets, mono-labelled, with visible focus rings and no
 * layout shift.
 */
import { useState } from "react";

/** What this bar can do to the active terminal — a slice of TerminalHandle. */
export interface TerminalInputTarget {
  sendInput: (data: string) => void;
  focus: () => void;
}

interface TerminalInputBarProps {
  /** The active terminal's imperative handle, or null when none is open. */
  target: TerminalInputTarget | null;
}

/** One special key: a human label and the exact bytes it transmits. */
interface SpecialKey {
  label: string;
  /** The raw byte sequence sent to the PTY. */
  bytes: string;
  /** Accessible name (the label alone can be a glyph like ↑). */
  aria: string;
}

// Exact sequences Claude's TUI expects. Arrows use the standard CSI forms.
const SPECIAL_KEYS: readonly SpecialKey[] = [
  { label: "Esc", bytes: "\x1b", aria: "Escape" },
  { label: "Tab", bytes: "\t", aria: "Tab" },
  { label: "Enter", bytes: "\r", aria: "Enter" },
  { label: "↑", bytes: "\x1b[A", aria: "Arrow up" },
  { label: "↓", bytes: "\x1b[B", aria: "Arrow down" },
  { label: "←", bytes: "\x1b[D", aria: "Arrow left" },
  { label: "→", bytes: "\x1b[C", aria: "Arrow right" },
  { label: "^C", bytes: "\x03", aria: "Control C (interrupt)" },
  { label: "^D", bytes: "\x04", aria: "Control D (end of input)" },
  { label: "^Z", bytes: "\x1a", aria: "Control Z (suspend)" },
];

function KeyButton({ k, onPress }: { k: SpecialKey; onPress: (bytes: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPress(k.bytes)}
      aria-label={k.aria}
      title={k.aria}
      // Compact ~36px touch targets on mobile, a roomier 40px on desktop.
      className="mono h-9 min-w-9 shrink-0 rounded-md px-2.5 text-xs tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 sm:h-10 sm:min-w-10"
      style={{
        color: "var(--color-text)",
        border: "1px solid var(--color-line)",
        backgroundColor: "var(--color-panel)",
      }}
    >
      {k.label}
    </button>
  );
}

export function TerminalInputBar({ target }: TerminalInputBarProps) {
  const [value, setValue] = useState("");
  const disabled = target === null;

  const press = (bytes: string): void => {
    if (!target) return;
    target.sendInput(bytes);
    // Keep the keyboard up / keys flowing to the same terminal after a tap.
    target.focus();
  };

  const submit = (): void => {
    if (!target) return;
    // A bare Enter on an empty box is still useful (e.g. confirm a prompt).
    target.sendInput(value + "\r");
    setValue("");
    target.focus();
  };

  return (
    <div
      className="flex shrink-0 flex-col gap-1.5 border-t p-1.5 hairline"
      style={{ backgroundColor: "var(--color-panel)" }}
    >
      {/* Special-keys bar — horizontally scrollable, never wraps / shifts. */}
      <div
        className="flex items-center gap-1 overflow-x-auto"
        role="toolbar"
        aria-label="Terminal special keys"
      >
        {SPECIAL_KEYS.map((k) => (
          <KeyButton key={k.label} k={k} onPress={press} />
        ))}
      </div>

      {/* Command bar — type a message to Claude or a shell command, then Send. */}
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder="message Claude / a command, then Send"
          aria-label="Terminal command input"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          enterKeyHint="send"
          className="mono h-9 min-w-0 flex-1 rounded-md px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 sm:h-10"
          style={{
            color: "var(--color-text)",
            border: "1px solid var(--color-line)",
            backgroundColor: "var(--color-void)",
          }}
        />
        <button
          type="submit"
          disabled={disabled}
          className="mono h-9 shrink-0 rounded-md px-3 text-xs font-medium tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10"
          style={{
            color: "var(--color-signal)",
            border: "1px solid var(--color-signal)",
            backgroundColor: "color-mix(in srgb, var(--color-signal) 10%, transparent)",
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

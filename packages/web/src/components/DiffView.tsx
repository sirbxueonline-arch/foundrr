/**
 * DiffView — renders a unified-diff string as color-keyed, monospace lines.
 *
 * Coloring (mirrors the telemetry palette):
 *   - additions ("+…")      → --ok    (green)
 *   - deletions ("-…")      → --alert (red)
 *   - hunk headers ("@@…")  → --cool, on a faint tinted band
 *   - file headers          → muted, slightly emphasized
 *   - context / everything  → muted
 *
 * The diff `+++`/`---` file markers are NOT treated as add/delete lines (they
 * are headers), so a renamed-or-changed file's header doesn't flash green/red.
 *
 * Long lines scroll horizontally rather than wrapping (preserving alignment);
 * the block as a whole keeps a fixed structure so loading a diff causes no
 * layout shift. No animation — reduced-motion safe by construction.
 */

interface DiffViewProps {
  diff: string;
  /** When true, render a note that the daemon capped the diff length. */
  truncated: boolean;
}

type LineKind = "add" | "del" | "hunk" | "fileHeader" | "meta" | "context";

interface DiffLine {
  kind: LineKind;
  text: string;
}

const KIND_COLOR: Record<LineKind, string> = {
  add: "var(--color-ok)",
  del: "var(--color-alert)",
  hunk: "var(--color-cool)",
  fileHeader: "var(--color-text)",
  meta: "var(--color-faint)",
  context: "var(--color-muted)",
};

/** Classify a single unified-diff line by its leading marker. */
function classify(line: string): LineKind {
  // File markers ("+++ b/x", "--- a/x") are headers, not content add/del.
  if (line.startsWith("+++") || line.startsWith("---")) return "fileHeader";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("diff ") || line.startsWith("index ")) return "meta";
  if (
    line.startsWith("new file") ||
    line.startsWith("deleted file") ||
    line.startsWith("rename ") ||
    line.startsWith("similarity ") ||
    line.startsWith("\\ ") // "\ No newline at end of file"
  ) {
    return "meta";
  }
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "context";
}

/** Split a unified-diff string into classified lines. */
function parseDiff(diff: string): DiffLine[] {
  if (!diff) return [];
  // Trailing newline produces an empty final entry we don't want to render.
  const raw = diff.endsWith("\n") ? diff.slice(0, -1) : diff;
  return raw.split("\n").map((text) => ({ kind: classify(text), text }));
}

export function DiffView({ diff, truncated }: DiffViewProps) {
  const lines = parseDiff(diff);

  if (lines.length === 0) {
    return (
      <p className="mono text-xs leading-tight" style={{ color: "var(--color-faint)" }}>
        No textual diff (binary file, or no changes).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <pre
        className="mono overflow-x-auto rounded-md p-3 text-xs leading-relaxed"
        style={{
          backgroundColor: "var(--color-void)",
          border: "1px solid var(--color-line)",
          margin: 0,
        }}
        aria-label="File diff"
      >
        <code>
          {lines.map((line, i) => (
            <div
              key={i}
              className="whitespace-pre"
              style={{
                color: KIND_COLOR[line.kind],
                backgroundColor:
                  line.kind === "hunk"
                    ? "color-mix(in srgb, var(--color-cool) 10%, transparent)"
                    : "transparent",
              }}
            >
              {/* Keep blank lines from collapsing the row height. */}
              {line.text === "" ? " " : line.text}
            </div>
          ))}
        </code>
      </pre>

      {truncated ? (
        <p className="caption" style={{ color: "var(--color-signal)" }}>
          Diff truncated — open the file locally to see the rest.
        </p>
      ) : null}
    </div>
  );
}

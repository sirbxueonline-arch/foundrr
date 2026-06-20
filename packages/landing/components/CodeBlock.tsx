"use client";

import { useCallback, useState } from "react";

interface CodeBlockProps {
  /** The command (or multi-line snippet) shown and copied verbatim. */
  code: string;
  /** Optional leading prompt glyph rendered before the code (not copied). */
  prompt?: string;
  /** Accessible label for the copy button (defaults to "Copy command"). */
  copyLabel?: string;
}

const RESET_MS = 1800;

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * A dark terminal-style code block with a working copy-to-clipboard button.
 * Client component (clipboard + transient "Copied" state). Falls back silently
 * if the Clipboard API is unavailable so the page never crashes.
 */
export function CodeBlock({
  code,
  prompt = "$",
  copyLabel = "Copy command",
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), RESET_MS);
    } catch {
      // Clipboard blocked (insecure context / permissions). Leave UI as-is —
      // the command is fully visible and selectable, so the user can copy by hand.
    }
  }, [code]);

  return (
    <div className="group/code relative flex items-stretch overflow-hidden rounded-lg border border-line bg-[color-mix(in_srgb,var(--void-2)_88%,transparent)]">
      <pre className="min-w-0 flex-1 overflow-x-auto px-4 py-3">
        <code className="font-mono text-[0.82rem] sm:text-sm leading-relaxed text-text">
          {prompt ? (
            <span className="select-none text-faint">{prompt} </span>
          ) : null}
          {code}
        </code>
      </pre>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? "Copied" : copyLabel}
        className="flex shrink-0 items-center gap-1.5 border-l border-line px-3 text-xs font-medium text-muted transition-colors hover:bg-panel hover:text-text"
      >
        {copied ? (
          <span className="flex items-center gap-1.5 text-ok">
            <CheckIcon />
            <span className="hidden sm:inline">Copied</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <CopyIcon />
            <span className="hidden sm:inline">Copy</span>
          </span>
        )}
      </button>
    </div>
  );
}

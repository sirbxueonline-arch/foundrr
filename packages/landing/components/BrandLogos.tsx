// Inline, dependency-free brand marks for AI coding agents.
//
// Every mark is a self-contained <svg> — no external image requests, so nothing
// can 404 or flash. Marks are simplified, recognizable silhouettes drawn from
// each vendor's public logo, tuned to read cleanly at ~18-22px on a dark
// surface. They are decorative: callers pass an accessible name via the
// surrounding text, and each svg carries a <title> for hover + is aria-hidden.

import type { CSSProperties } from "react";

interface LogoProps {
  /** Square size in px. Defaults to 20. */
  readonly size?: number;
  /** Extra classes (e.g. for color via `text-*`). */
  readonly className?: string;
}

const DEFAULT_SIZE = 20;

function base(size: number): {
  width: number;
  height: number;
  viewBox: string;
  role: "img";
  "aria-hidden": true;
  focusable: false;
  style: CSSProperties;
} {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    role: "img",
    "aria-hidden": true,
    focusable: false,
    style: { display: "block" },
  };
}

/** Anthropic / Claude — the angular "A" sunburst mark. */
export function AnthropicLogo({ size = DEFAULT_SIZE, className }: LogoProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor">
      <title>Anthropic Claude</title>
      <path d="M13.6 3.2h3.05L23.3 20.8h-3.18l-1.36-3.66h-6.9l-1.36 3.66H7.32L13.6 3.2Zm-.39 11.1h4.7l-2.35-6.33-2.35 6.33Z" />
      <path d="M6.86 3.2h3.2L3.78 20.8H.6L6.86 3.2Z" opacity="0.55" />
    </svg>
  );
}

/** OpenAI — the six-petal "blossom" knot. */
export function OpenAILogo({ size = DEFAULT_SIZE, className }: LogoProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor">
      <title>OpenAI</title>
      <path d="M22.28 9.82a5.6 5.6 0 0 0-.48-4.6 5.67 5.67 0 0 0-6.1-2.72A5.6 5.6 0 0 0 11.45.6a5.67 5.67 0 0 0-5.4 3.92 5.6 5.6 0 0 0-3.75 2.72A5.67 5.67 0 0 0 3 14.18a5.6 5.6 0 0 0 .48 4.6 5.67 5.67 0 0 0 6.1 2.72A5.6 5.6 0 0 0 13.79 24a5.67 5.67 0 0 0 5.4-3.93 5.6 5.6 0 0 0 3.75-2.72 5.67 5.67 0 0 0-.66-6.62 5.6 5.6 0 0 0 0 .09Zm-8.49 11.88a4.2 4.2 0 0 1-2.7-.98l.13-.08 4.49-2.59a.73.73 0 0 0 .37-.64v-6.33l1.9 1.1a.07.07 0 0 1 .04.05v5.24a4.22 4.22 0 0 1-4.22 4.21Zm-9.06-3.87a4.2 4.2 0 0 1-.5-2.82l.13.08 4.5 2.6a.73.73 0 0 0 .73 0l5.49-3.17v2.19a.07.07 0 0 1-.03.06l-4.54 2.62a4.22 4.22 0 0 1-5.76-1.54l-.02-.02Zm-1.18-9.8a4.2 4.2 0 0 1 2.2-1.85V11.5a.73.73 0 0 0 .36.63l5.48 3.16-1.9 1.1a.07.07 0 0 1-.06 0L5.59 13.77a4.22 4.22 0 0 1-1.55-5.76l.01.02Zm15.6 3.63-5.48-3.18 1.9-1.1a.07.07 0 0 1 .06 0l4.54 2.63a4.21 4.21 0 0 1-.65 7.6v-5.32a.73.73 0 0 0-.36-.63h-.01Zm1.89-2.85-.13-.08-4.49-2.6a.73.73 0 0 0-.74 0L11.6 9.03V6.84a.07.07 0 0 1 .03-.06l4.54-2.62a4.21 4.21 0 0 1 6.26 4.36l-.04-.02ZM10.56 12.7l-1.9-1.1a.07.07 0 0 1-.04-.05V6.31a4.21 4.21 0 0 1 6.92-3.23l-.13.08-4.49 2.59a.73.73 0 0 0-.37.64l.01 6.32Zm1.03-2.22 2.44-1.41 2.45 1.41v2.82l-2.45 1.41-2.44-1.41v-2.83Z" />
    </svg>
  );
}

/** Google Gemini — the four-point spark / star. */
export function GeminiLogo({ size = DEFAULT_SIZE, className }: LogoProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor">
      <title>Google Gemini</title>
      <path d="M12 1.5c.32 5.46 4.54 9.68 10 10-5.46.32-9.68 4.54-10 10-.32-5.46-4.54-9.68-10-10 5.46-.32 9.68-4.54 10-10Z" />
    </svg>
  );
}

/** Aider — terminal bracket + caret, its CLI-native identity. */
export function AiderLogo({ size = DEFAULT_SIZE, className }: LogoProps) {
  return (
    <svg
      {...base(size)}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Aider</title>
      <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
      <path d="M6.5 9.5 9.5 12l-3 2.5" />
      <path d="M12.5 14.5h5" />
    </svg>
  );
}

/** Amazon Q — Amazon's smile arrow under a "Q" ring. */
export function AmazonQLogo({ size = DEFAULT_SIZE, className }: LogoProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor">
      <title>Amazon Q</title>
      <path d="M12 2.6a7.4 7.4 0 0 0-2.6 14.33v2.07a.5.5 0 0 0 .77.42 9.4 9.4 0 0 0 2.43-2.02h.4a7.4 7.4 0 0 0 5.23-12.63A7.36 7.36 0 0 0 12 2.6Zm0 12.1a4.7 4.7 0 1 1 3.33-1.38l1.1 1.1a.5.5 0 0 1-.35.85h-1.7A4.68 4.68 0 0 1 12 14.7Z" />
      <path
        d="M5.2 19.4c3.9 2.5 9.3 2.6 13.3.3.5-.3 1 .3.6.7-2 1.9-5 2.7-7.8 2.5-2.3-.1-4.6-.9-6.4-2.4-.4-.3 0-1 .3-.8l1.7-.3Z"
        opacity="0.85"
      />
    </svg>
  );
}

/** Cursor — its angular cube/cursor wedge. */
export function CursorLogo({ size = DEFAULT_SIZE, className }: LogoProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor">
      <title>Cursor</title>
      <path d="M12 2 3.2 7v10L12 22l8.8-5V7L12 2Zm0 2.3 6.4 3.65L12 11.6 5.6 7.95 12 4.3Zm-6.9 4.9L11 12.6v7.1l-5.9-3.4V9.2Zm13.8 0v7.1L13 19.7v-7.1l5.9-3.4Z" />
    </svg>
  );
}

/** GitHub Copilot — the friendly visor head. */
export function CopilotLogo({ size = DEFAULT_SIZE, className }: LogoProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor">
      <title>GitHub Copilot</title>
      <path d="M20.4 9.3c-.3-.5-.7-.9-1.2-1.2v-.7a3.4 3.4 0 0 0-3.4-3.4h-1.2A3 3 0 0 0 12 2.6a3 3 0 0 0-2.6 1.4H8.2a3.4 3.4 0 0 0-3.4 3.4v.7c-.5.3-.9.7-1.2 1.2A3 3 0 0 0 3 11v3.2a4.7 4.7 0 0 0 2.7 4.25c1.9.95 4.1 1.45 6.3 1.45s4.4-.5 6.3-1.45A4.7 4.7 0 0 0 21 14.2V11a3 3 0 0 0-.6-1.7ZM8.2 6h7.6c.77 0 1.4.63 1.4 1.4v.6H6.8v-.6c0-.77.63-1.4 1.4-1.4Zm10.8 8.2c0 1.05-.6 2-1.55 2.45-1.65.8-3.5 1.2-5.45 1.2s-3.8-.4-5.45-1.2A2.7 2.7 0 0 1 5 14.2V11.4h14v2.8Z" />
      <circle cx="9" cy="12.4" r="1.25" />
      <circle cx="15" cy="12.4" r="1.25" />
    </svg>
  );
}

/** Generic terminal mark — fallback for open-source / IDE agents without a mark. */
export function TerminalLogo({ size = DEFAULT_SIZE, className }: LogoProps) {
  return (
    <svg
      {...base(size)}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Terminal agent</title>
      <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
      <path d="M6.5 9.5 10 12l-3.5 2.5M13 14.5h4.5" />
    </svg>
  );
}

/** Resolve a logo component by model key. Unknown keys fall back to a terminal. */
export function logoForKey(
  key: string,
): (props: LogoProps) => React.ReactElement {
  switch (key) {
    case "claude-code":
      return AnthropicLogo;
    case "openai-codex":
      return OpenAILogo;
    case "gemini-cli":
      return GeminiLogo;
    case "aider":
      return AiderLogo;
    case "amazon-q":
      return AmazonQLogo;
    case "cursor":
      return CursorLogo;
    case "github-copilot":
      return CopilotLogo;
    default:
      return TerminalLogo;
  }
}

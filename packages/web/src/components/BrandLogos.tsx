// Official brand marks for the AI coding agents, used by the model picker.
// Ported verbatim from the landing package so the dashboard shows the same
// vetted, self-contained inline <svg> marks (no external image / network).
// Each mark renders ~16-20px and carries the brand's official hex color;
// near-black marks adapt to the surface (light dashboard → true near-black).

import type { CSSProperties, ReactElement } from "react";

interface LogoProps {
  /** Square size in px. Defaults to 20. */
  readonly size?: number;
  readonly className?: string;
  /** Surface tone — near-black marks darken on light, lighten on dark. */
  readonly surface?: "light" | "dark";
}

const DEFAULT_SIZE = 20;
const DARK_ON_DARK = "#e6eaf0";
const NEAR_BLACK = "#1b2128";

interface Mark {
  readonly title: string;
  readonly viewBox: string;
  readonly color: string;
  readonly paths: readonly string[];
}

const ADAPTIVE = "adaptive";

function resolveColor(color: string): string {
  // Adaptive (near-black) marks inherit the surrounding text color via
  // `currentColor`, so they flip automatically with the light/dark theme — no
  // `surface` prop or React re-render needed.
  return color === ADAPTIVE ? "currentColor" : color;
}

const CLAUDE_CODE: Mark = {
  title: "Claude Code",
  viewBox: "0 0 24 24",
  color: "#D97757",
  paths: [
    "M21 10.5h3v3h-3v3h-1.5v3H18v-3h-1.5v3H15v-3H9v3H7.5v-3H6v3H4.5v-3H3v-3H0v-3h3v-6h18Zm-15 0h1.5v-3H6Zm10.5 0H18v-3h-1.5z",
  ],
};

const OPENAI: Mark = {
  title: "OpenAI",
  viewBox: "0 0 20 20",
  color: ADAPTIVE,
  paths: [
    "M11.248 18.25q-.825 0-1.568-.314a4.3 4.3 0 0 1-1.32-.874 4 4 0 0 1-1.304.214 4 4 0 0 1-2.046-.544 4.27 4.27 0 0 1-1.518-1.485 4 4 0 0 1-.56-2.095q0-.48.131-1.04A4.4 4.4 0 0 1 2.04 10.71a4.07 4.07 0 0 1 .017-3.4 4.2 4.2 0 0 1 1.056-1.418 3.8 3.8 0 0 1 1.6-.842 3.9 3.9 0 0 1 .76-1.683q.593-.759 1.451-1.188a4.04 4.04 0 0 1 1.832-.429q.825 0 1.567.313.742.314 1.32.875a4 4 0 0 1 1.304-.215q1.106 0 2.046.545a4.14 4.14 0 0 1 1.501 1.485q.578.941.578 2.095 0 .48-.132 1.04.66.61 1.023 1.419.363.792.363 1.666 0 .892-.38 1.717a4.3 4.3 0 0 1-1.072 1.435 3.8 3.8 0 0 1-1.584.825 3.8 3.8 0 0 1-.775 1.683 4.06 4.06 0 0 1-1.436 1.188 4.04 4.04 0 0 1-1.832.429m-4.076-2.062q.825 0 1.435-.347l3.103-1.782a.36.36 0 0 0 .164-.313v-1.42L7.881 14.62a.67.67 0 0 1-.726 0l-3.118-1.798a.5.5 0 0 1-.017.115v.198q0 .841.396 1.551.413.693 1.139 1.089a3.2 3.2 0 0 0 1.617.412m.165-2.69a.4.4 0 0 0 .181.05q.083 0 .165-.05l1.238-.71-3.977-2.31a.7.7 0 0 1-.363-.643v-3.58q-.825.362-1.32 1.122a2.9 2.9 0 0 0-.495 1.65q0 .809.413 1.55.412.743 1.072 1.123zm3.91 3.663q.875 0 1.585-.396a2.96 2.96 0 0 0 1.534-2.64v-3.564a.32.32 0 0 0-.165-.297l-1.254-.726v4.604a.7.7 0 0 1-.363.643l-3.119 1.799a3 3 0 0 0 1.783.577m.627-6.039V8.878L10.01 7.822 8.129 8.878v2.244l1.881 1.056zM7.057 5.859a.7.7 0 0 1 .363-.644l3.119-1.798a3 3 0 0 0-1.782-.578q-.874 0-1.584.396A2.96 2.96 0 0 0 6.05 4.324a3.07 3.07 0 0 0-.396 1.551v3.547q0 .199.165.314l1.237.726zm8.383 7.887q.825-.364 1.303-1.123.495-.758.495-1.65a3.15 3.15 0 0 0-.412-1.55q-.413-.743-1.073-1.123l-3.086-1.782q-.099-.065-.181-.049a.3.3 0 0 0-.165.05l-1.238.692 3.993 2.327a.6.6 0 0 1 .264.264.64.64 0 0 1 .1.363zm-3.317-8.382a.63.63 0 0 1 .726 0l3.135 1.831v-.297q0-.792-.396-1.501a2.86 2.86 0 0 0-1.105-1.155q-.71-.43-1.65-.43-.825 0-1.436.347L8.294 5.941a.36.36 0 0 0-.165.314v1.418z",
  ],
};

const GEMINI: Mark = {
  title: "Google Gemini",
  viewBox: "0 0 24 24",
  color: "#8E75B2",
  paths: [
    "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81",
  ],
};

const COPILOT: Mark = {
  title: "GitHub Copilot",
  viewBox: "0 0 24 24",
  color: ADAPTIVE,
  paths: [
    "M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z",
  ],
};

const CURSOR: Mark = {
  title: "Cursor",
  viewBox: "0 0 24 24",
  color: ADAPTIVE,
  paths: [
    "M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23",
  ],
};

const WINDSURF: Mark = {
  title: "Windsurf",
  viewBox: "0 0 24 24",
  color: ADAPTIVE,
  paths: [
    "M23.55 5.067c-1.2038-.002-2.1806.973-2.1806 2.1765v4.8676c0 .972-.8035 1.7594-1.7597 1.7594-.568 0-1.1352-.286-1.4718-.7659l-4.9713-7.1003c-.4125-.5896-1.0837-.941-1.8103-.941-1.1334 0-2.1533.9635-2.1533 2.153v4.8957c0 .972-.7969 1.7594-1.7596 1.7594-.57 0-1.1363-.286-1.4728-.7658L.4076 5.1598C.2822 4.9798 0 5.0688 0 5.2882v4.2452c0 .2147.0656.4228.1884.599l5.4748 7.8183c.3234.462.8006.8052 1.3509.9298 1.3771.313 2.6446-.747 2.6446-2.0977v-4.893c0-.972.7875-1.7593 1.7596-1.7593h.003a1.798 1.798 0 0 1 1.4718.7658l4.9723 7.0994c.4135.5905 1.05.941 1.8093.941 1.1587 0 2.1515-.9645 2.1515-2.153v-4.8948c0-.972.7875-1.7594 1.7596-1.7594h.194a.22.22 0 0 0 .2204-.2202v-4.622a.22.22 0 0 0-.2203-.2203Z",
  ],
};

const CLINE: Mark = {
  title: "Cline",
  viewBox: "0 0 24 24",
  color: ADAPTIVE,
  paths: [
    "m23.365 13.556-1.442-2.895V8.994c0-2.764-2.218-5.002-4.954-5.002h-2.464c.178-.367.276-.779.276-1.213A2.77 2.77 0 0 0 12.018 0a2.77 2.77 0 0 0-2.763 2.779c0 .434.098.846.276 1.213H7.067c-2.736 0-4.954 2.238-4.954 5.002v1.667L.64 13.549c-.149.29-.149.636 0 .927l1.472 2.855v1.667C2.113 21.762 4.33 24 7.067 24h9.902c2.736 0 4.954-2.238 4.954-5.002V17.33l1.44-2.865c.143-.286.143-.622.002-.91m-12.854 2.36a2.27 2.27 0 0 1-2.261 2.273 2.27 2.27 0 0 1-2.261-2.273v-4.042A2.27 2.27 0 0 1 8.249 9.6a2.267 2.267 0 0 1 2.262 2.274zm7.285 0a2.27 2.27 0 0 1-2.26 2.273 2.27 2.27 0 0 1-2.262-2.273v-4.042A2.267 2.267 0 0 1 15.535 9.6a2.267 2.267 0 0 1 2.261 2.274z",
  ],
};

const CONTINUE: Mark = {
  title: "Continue",
  viewBox: "0 0 26 24",
  color: ADAPTIVE,
  paths: [
    "M20.5286 3.26811L19.1512 5.65694L22.6328 11.6849C22.6582 11.7306 22.6735 11.7866 22.6735 11.8374C22.6735 11.8882 22.6582 11.9441 22.6328 11.9899L19.1512 18.0229L20.5286 20.4117L25.4791 11.8374L20.5286 3.26303V3.26811ZM18.6176 5.3469L19.995 2.95807H17.2402L15.8628 5.3469H18.6227H18.6176ZM15.8577 5.96697L19.075 11.5324H21.8298L18.6176 5.96697H15.8577ZM18.6176 17.7179L21.8298 12.1474H19.075L15.8577 17.7179H18.6176ZM15.8577 18.338L17.2351 20.7167H19.9899L18.6125 18.338H15.8526H15.8577ZM6.52098 21.3063C6.46507 21.3063 6.41424 21.291 6.3685 21.2656C6.32276 21.2402 6.28209 21.1995 6.25668 21.1538L2.77002 15.1207H0.0152482L4.9657 23.69H14.8615L13.4841 21.3063H6.52606H6.52098ZM14.0178 20.9962L15.3952 23.38L16.7726 20.9911L15.3952 18.6023L14.0178 20.9911V20.9962ZM14.8615 18.2974H8.43712L7.05973 20.6862H13.4841L14.8615 18.2974ZM7.89836 17.9924L4.68108 12.4219L3.30369 14.8107L6.52098 20.3812L7.89836 17.9924ZM0.0101654 14.5007H2.76494L4.14232 12.1118H1.39263L0.0101654 14.5007ZM6.51081 3.31386L3.29861 8.8793L4.67599 11.2681L7.8882 5.70268L6.51081 3.31386ZM13.4791 3.00382H7.04448L8.42187 5.39264H14.8564L13.4791 3.00382ZM15.3952 5.0826L16.7675 2.69886L15.3952 0.310038L14.0178 2.69378L15.3952 5.0826Z",
  ],
};

const AMAZON_Q_OUTER =
  "M54.17,2.63L15.77,24.8c-6.08,3.51-9.83,10-9.83,17.03v44.34c0,7.03,3.75,13.52,9.83,17.03l38.4,22.17c6.08,3.51,13.58,3.51,19.66,0l38.4-22.17c6.08-3.51,9.83-10,9.83-17.03v-44.34c0-7.02-3.75-13.52-9.83-17.03L73.83,2.63c-6.08-3.51-13.58-3.51-19.66,0Z";
const AMAZON_Q_INNER =
  "M100.98,35.15l-30.49-17.6c-1.79-1.03-4.14-1.55-6.5-1.55s-4.71.52-6.5,1.55l-30.49,17.6c-3.57,2.06-6.5,7.13-6.5,11.25v35.2c0,4.13,2.92,9.19,6.5,11.25l30.49,17.6c1.79,1.03,4.14,1.55,6.5,1.55s4.71-.52,6.5-1.55l30.49-17.6c3.57-2.06,6.5-7.13,6.5-11.25v-35.2c0-4.13-2.92-9.19-6.5-11.25Zm-34.49,68.38c-.28.16-1.17.48-2.5.48s-2.21-.31-2.5-.48l-30.49-17.6c-1.1-.63-2.5-3.06-2.5-4.32v-35.2c0-1.27,1.4-3.69,2.5-4.32l30.49-17.6c.28-.16,1.17-.48,2.5-.48s2.21.31,2.5.48l30.49,17.6c1.1.63,2.5,3.06,2.5,4.32v33.47l-27.48-15.86v-3.29c0-.82-.44-1.58-1.15-2l-5.7-3.29c-.36-.21-.75-.31-1.15-.31s-.8.1-1.15.31l-5.7,3.29c-.71.41-1.15,1.17-1.15,2v6.58c0,.82.44,1.58,1.15,2l5.7,3.29c.36.21.75.31,1.15.31s.8-.1,1.15-.31l2.85-1.64,27.48,15.86-28.98,16.73Z";

const base = (size: number, viewBox: string) =>
  ({
    width: size,
    height: size,
    viewBox,
    role: "img" as const,
    "aria-hidden": true as const,
    focusable: false as const,
    style: { display: "block" } satisfies CSSProperties,
  }) as const;

function SingleColorLogo(mark: Mark) {
  return function Logo({ size = DEFAULT_SIZE, className }: LogoProps) {
    return (
      <svg {...base(size, mark.viewBox)} className={className} fill={resolveColor(mark.color)}>
        <title>{mark.title}</title>
        {mark.paths.map((d) => (
          <path key={d.slice(0, 24)} d={d} />
        ))}
      </svg>
    );
  };
}

export const ClaudeCodeLogo = SingleColorLogo(CLAUDE_CODE);
export const OpenAILogo = SingleColorLogo(OPENAI);
export const GeminiLogo = SingleColorLogo(GEMINI);
export const CopilotLogo = SingleColorLogo(COPILOT);
export const CursorLogo = SingleColorLogo(CURSOR);
export const WindsurfLogo = SingleColorLogo(WINDSURF);
export const ClineLogo = SingleColorLogo(CLINE);
export const ContinueLogo = SingleColorLogo(CONTINUE);

export function AmazonQLogo({ size = DEFAULT_SIZE, className }: LogoProps) {
  const gradientId = `amazonq-grad-${size}`;
  return (
    <svg {...base(size, "0 0 128 128")} className={className}>
      <title>Amazon Q Developer</title>
      <defs>
        <linearGradient id={gradientId} x1="115.52" y1="-9.57" x2="18.86" y2="128.46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a7f8ff" />
          <stop offset="0.26" stopColor="#008dff" />
          <stop offset="0.66" stopColor="#7f33ff" />
          <stop offset="0.99" stopColor="#39127d" />
        </linearGradient>
      </defs>
      <path d={AMAZON_Q_OUTER} fill={`url(#${gradientId})`} />
      <path d={AMAZON_Q_INNER} fill="#fff" />
    </svg>
  );
}

export function AiderLogo({ size = DEFAULT_SIZE, className }: LogoProps) {
  return (
    <svg {...base(size, "0 0 24 24")} className={className}>
      <title>Aider</title>
      <rect x="1" y="1" width="22" height="22" rx="5.5" fill="#14B85F" />
      <path d="M12 5.6 17.4 18h-2.46l-1.06-2.62H8.12L7.06 18H4.6L12 5.6Zm0 4.05-1.78 4.32h3.56L12 9.65Z" fill="#06140C" />
    </svg>
  );
}

function MonogramLogo(letter: string) {
  return function Logo({ size = DEFAULT_SIZE, className }: LogoProps) {
    return (
      <svg {...base(size, "0 0 24 24")} className={className}>
        <title>{letter} agent</title>
        <rect x="1" y="1" width="22" height="22" rx="5.5" fill="#5a6675" />
        <text
          x="12"
          y="16.6"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="13"
          fontWeight="600"
          fill="#ffffff"
        >
          {letter}
        </text>
      </svg>
    );
  };
}

/** Resolve a logo component by model key. Unknown keys fall back to a monogram. */
export function logoForKey(key: string): (props: LogoProps) => ReactElement {
  switch (key) {
    case "claude-code":
      return ClaudeCodeLogo;
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
    case "cline":
      return ClineLogo;
    case "windsurf":
      return WindsurfLogo;
    case "continue":
      return ContinueLogo;
    default: {
      const letter = (key.trim()[0] ?? "?").toUpperCase();
      return MonogramLogo(letter);
    }
  }
}

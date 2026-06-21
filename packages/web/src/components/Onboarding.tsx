/**
 * Onboarding — a one-time, first-run product tour. The first time the dashboard
 * is opened on a device it shows a centered, dismissible modal carousel that
 * walks through the main surfaces; after that it never shows again (the "seen"
 * flag is persisted to localStorage). A Skip button exits at any point.
 *
 * Modeled on the product tours of Linear / Vercel / Cursor: a centered card with
 * a glyph, a title + one line of copy, progress dots, and Back / Next, with Skip
 * top-right. Esc skips; ←/→ navigate. Themed via tokens so it matches light/dark.
 */
import { useEffect, useState, type ReactNode } from "react";

const ONBOARD_KEY = "mc.onboarded.v1";

/** Whether this device has already completed (or skipped) the first-run tour. */
export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARD_KEY) === "1";
  } catch {
    // No storage (private mode) → don't nag; treat as already seen.
    return true;
  }
}

function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARD_KEY, "1");
  } catch {
    // Best-effort; if storage is blocked the tour simply shows next time.
  }
}

/** Clear the flag so the tour shows again (used by the Settings "Replay" row). */
export function resetOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARD_KEY);
  } catch {
    // Best-effort.
  }
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

interface Step {
  icon: ReactNode;
  title: string;
  body: string;
}

const STEPS: ReadonlyArray<Step> = [
  {
    icon: (
      <Glyph>
        <path d="M12 3l9 9-9 9-9-9z" />
      </Glyph>
    ),
    title: "Welcome to Foundrr",
    body: "Your local command center for supervising AI coding agents — Claude Code, Codex, Gemini and more. It all runs on this machine.",
  },
  {
    icon: (
      <Glyph>
        <path d="M3 12h4l2.5 7 5-14 2.5 7h4" />
      </Glyph>
    ),
    title: "Watch your agents live",
    body: "The Agents tab shows every session as it runs — files touched, commands fired, tokens and cost — in real time.",
  },
  {
    icon: (
      <Glyph>
        <rect x="3" y="4" width="18" height="6" rx="1.5" />
        <rect x="3" y="14" width="18" height="6" rx="1.5" />
        <path d="M7 7h.01M7 17h.01" />
      </Glyph>
    ),
    title: "Reach your dev servers",
    body: "Servers lists every listening port and opens or previews it in one tap — even over a remote tunnel.",
  },
  {
    icon: (
      <Glyph>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M8 9l3 3-3 3M13 15h4" />
      </Glyph>
    ),
    title: "A real terminal, built in",
    body: "Launch any AI CLI right here. Pick which agent in Settings, and the terminal starts it for you.",
  },
  {
    icon: (
      <Glyph>
        <rect x="7" y="2" width="10" height="20" rx="2.5" />
        <path d="M11 18h2" />
      </Glyph>
    ),
    title: "The leash — approve from anywhere",
    body: "Link Telegram in Settings and approve an agent's permission prompts from your phone with one tap, even away from the desk.",
  },
  {
    icon: (
      <Glyph>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="9" cy="6" r="2" />
        <circle cx="15" cy="12" r="2" />
        <circle cx="8" cy="18" r="2" />
      </Glyph>
    ),
    title: "Make it yours",
    body: "Stats shows spend trends and budgets; Settings holds your model, appearance and remote access. That's the tour — you're set.",
  },
];

export function Onboarding() {
  const [open, setOpen] = useState<boolean>(() => !hasOnboarded());
  const [i, setI] = useState(0);

  const finish = (): void => {
    markOnboarded();
    setOpen(false);
  };
  const back = (): void => setI((v) => Math.max(0, v - 1));
  const next = (): void => {
    setI((v) => {
      if (v >= STEPS.length - 1) {
        finish();
        return v;
      }
      return v + 1;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // finish/next/back are stable enough for a one-shot modal; only re-bind on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const step = STEPS[i];
  if (!step) return null;
  const last = i === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Foundrr"
    >
      <button
        type="button"
        aria-label="Skip tutorial"
        onClick={finish}
        className="absolute inset-0 h-full w-full"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-text) 40%, transparent)" }}
      />

      <div className="panel relative z-10 w-full max-w-md overflow-hidden p-0">
        <div className="flex justify-end p-3">
          <button type="button" onClick={finish} className="pill">
            Skip
          </button>
        </div>

        <div className="flex flex-col items-center px-8 pb-2 text-center">
          <span
            className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: "var(--color-inset)",
              color: "var(--color-signal-ink)",
              border: "1px solid var(--color-line)",
            }}
          >
            {step.icon}
          </span>
          <h2 className="text-lg font-medium" style={{ color: "var(--color-text)" }}>
            {step.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
            {step.body}
          </p>
        </div>

        <div className="flex justify-center gap-1.5 py-5" aria-hidden="true">
          {STEPS.map((_, idx) => (
            <span
              key={idx}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: idx === i ? "1.25rem" : "0.375rem",
                backgroundColor: idx === i ? "var(--color-signal)" : "var(--color-line)",
              }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t p-3 hairline">
          <button type="button" onClick={back} disabled={i === 0} className="pill">
            Back
          </button>
          <span className="mono text-[0.625rem]" style={{ color: "var(--color-faint)" }}>
            {i + 1} / {STEPS.length}
          </span>
          <button type="button" onClick={next} className="pill pill-primary">
            {last ? "Get started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

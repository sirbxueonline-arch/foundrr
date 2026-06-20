/**
 * ThemeToggle — flips the dashboard between Aqua's light and dark expressions.
 *
 * Self-contained: it sets `<html data-theme="dark">` (or clears it for light)
 * and persists the choice to localStorage. The CSS does the rest — every
 * component reads the same `--color-*` token names, so the whole surface flips
 * with no prop threading. Light is the default; dark opts in.
 *
 * The initial theme is applied in main.tsx (before React renders) to avoid a
 * flash; this component keeps it in sync after toggles.
 */
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
export const THEME_KEY = "mc.theme";

export function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  const el = document.documentElement;
  if (theme === "dark") el.dataset.theme = "dark";
  else delete el.dataset.theme;
}

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

interface ThemeToggleProps {
  /** Extra classes (e.g. `w-full` in the sidebar footer). */
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const isDark = theme === "dark";
  const toggle = (): void => {
    const next: Theme = isDark ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // localStorage may be unavailable (private mode) — in-memory state still applies.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`pill${className ? ` ${className}` : ""}`}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
      <span>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}

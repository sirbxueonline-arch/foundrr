import Link from "next/link";

import { GITHUB_URL } from "@/lib/config";

function GitHubMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.39 1.24-3.23-.13-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.23 0 4.63-2.81 5.65-5.49 5.95.43.37.81 1.1.81 2.22v3.29c0 .32.21.69.82.58A12 12 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="transition-transform group-hover:translate-x-0.5"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

export function Hero() {
  return (
    <header id="top" className="relative overflow-hidden">
      {/* Animated background layers */}
      <div className="absolute inset-0 console-grid pointer-events-none" aria-hidden />
      <div
        className="absolute inset-0 console-grid-fine pointer-events-none"
        aria-hidden
      />
      <div className="absolute inset-0 hero-glow pointer-events-none" aria-hidden />
      <div className="signal-sweep" aria-hidden />
      {/* Top edge sweep line */}
      <div
        className="absolute top-0 left-0 right-0 h-px overflow-hidden"
        aria-hidden
      >
        <div className="sweep h-px w-1/4" />
      </div>

      <div className="relative mx-auto max-w-4xl px-5 pt-24 pb-16 sm:pt-32 sm:pb-24 text-center">
        <div className="rise inline-flex items-center gap-2 rounded-full border border-line bg-[color-mix(in_srgb,var(--panel)_75%,transparent)] px-3.5 py-1.5 backdrop-blur-sm">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="pulse-dot absolute inset-0" />
            <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-signal" />
          </span>
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted">
            open-source dev supervision
          </span>
        </div>

        <h1
          className="rise mt-8 font-display text-6xl sm:text-8xl font-bold tracking-[-0.03em] leading-[0.95]"
          style={{ animationDelay: "60ms" }}
        >
          <span className="bg-gradient-to-b from-text to-[color-mix(in_srgb,var(--text)_55%,var(--void))] bg-clip-text text-transparent">
            Founder
          </span>
        </h1>

        <p
          className="rise mx-auto mt-7 max-w-2xl text-lg sm:text-2xl text-muted leading-relaxed text-balance"
          style={{ animationDelay: "120ms" }}
        >
          Supervise your AI coding agents from anywhere — and watch the
          world&apos;s{" "}
          <span className="text-text">token spend in real time.</span>
        </p>

        <div
          className="rise mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
          style={{ animationDelay: "180ms" }}
        >
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl bg-signal px-7 py-3.5 font-semibold text-[#0d1014] transition-transform hover:-translate-y-0.5 box-glow-signal"
          >
            <GitHubMark />
            Get it on GitHub
          </a>
          <Link
            href="/setup"
            className="group inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-line bg-[color-mix(in_srgb,var(--panel)_70%,transparent)] px-7 py-3.5 font-medium text-text backdrop-blur-sm transition-colors hover:border-[var(--cool)] hover:text-cool"
          >
            How it works
            <ArrowRight />
          </Link>
        </div>

        {/* Install command terminal chip */}
        <div
          className="rise mx-auto mt-10 inline-flex max-w-full items-center gap-3 rounded-lg border border-line bg-[color-mix(in_srgb,var(--void-2)_85%,transparent)] px-4 py-2.5 backdrop-blur-sm"
          style={{ animationDelay: "240ms" }}
        >
          <span className="flex items-center gap-1.5" aria-hidden>
            <span className="h-2 w-2 rounded-full bg-alert/70" />
            <span className="h-2 w-2 rounded-full bg-signal/70" />
            <span className="h-2 w-2 rounded-full bg-ok/70" />
          </span>
          <code className="font-mono text-xs sm:text-sm text-muted truncate">
            <span className="text-faint select-none">$ </span>
            <span className="text-text">npx</span> founder init
            <span className="caret" aria-hidden />
          </code>
        </div>
      </div>
    </header>
  );
}

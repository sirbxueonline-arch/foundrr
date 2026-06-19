import { GITHUB_URL } from "@/lib/config";

function GitHubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.39 1.24-3.23-.13-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.23 0 4.63-2.81 5.65-5.49 5.95.43.37.81 1.1.81 2.22v3.29c0 .32.21.69.82.58A12 12 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}

export function Hero() {
  return (
    <header className="relative overflow-hidden">
      <div className="absolute inset-0 console-grid pointer-events-none" aria-hidden />
      {/* Header sweep line */}
      <div className="absolute top-0 left-0 right-0 h-px overflow-hidden" aria-hidden>
        <div className="sweep h-px w-1/3" />
      </div>

      <div className="relative mx-auto max-w-4xl px-5 pt-20 pb-16 sm:pt-28 sm:pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 mb-8">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="pulse-dot absolute inset-0" />
            <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-signal" />
          </span>
          <span className="font-mono text-xs text-muted tracking-wide">
            open-source dev supervision
          </span>
        </div>

        <h1 className="font-display text-5xl sm:text-7xl font-bold tracking-tight">
          Founder
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg sm:text-xl text-muted leading-relaxed">
          Supervise your AI coding agents from anywhere — and watch the world&apos;s
          token spend in real time.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2.5 rounded-lg bg-signal px-6 py-3 font-medium text-[#0d1014] transition-transform hover:-translate-y-0.5 signal-glow-soft"
          >
            <GitHubMark />
            Get it on GitHub
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-6 py-3 font-medium text-text transition-colors hover:border-[var(--cool)] hover:text-cool"
          >
            How it works
          </a>
        </div>

        <p className="mt-6 font-mono text-xs text-faint">
          $ curl -fsSL mission.control/install | sh
        </p>
      </div>
    </header>
  );
}

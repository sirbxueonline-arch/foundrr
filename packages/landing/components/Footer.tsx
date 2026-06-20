import { GITHUB_URL, SITE_URL } from "@/lib/config";

function GitHubMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.39 1.24-3.23-.13-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.23 0 4.63-2.81 5.65-5.49 5.95.43.37.81 1.1.81 2.22v3.29c0 .32.21.69.82.58A12 12 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}

const PRODUCT_LINKS = [
  { href: "#leaderboard", label: "Leaderboard" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#telemetry", label: "Telemetry" },
];

export function Footer() {
  const host = SITE_URL.replace(/^https?:\/\//, "");
  return (
    <footer className="relative border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2">
                <span className="pulse-dot absolute inset-0" aria-hidden />
                <span
                  className="relative inline-block h-2 w-2 rounded-full bg-signal"
                  aria-hidden
                />
              </span>
              <p className="font-display text-lg font-semibold text-text">
                Founder
              </p>
            </div>
            <p className="mt-3 max-w-sm text-sm text-muted leading-relaxed">
              Supervise your AI coding agents from anywhere — and watch the
              world&apos;s token spend in real time. Open-source, self-hosted dev
              supervision.
            </p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-2 text-sm font-medium text-text transition-colors hover:border-[var(--signal)] hover:text-signal"
            >
              <GitHubMark />
              Star on GitHub
            </a>
          </div>

          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-faint">
              Product
            </p>
            <ul className="mt-4 space-y-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-muted transition-colors hover:text-text"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-faint">
              Resources
            </p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted transition-colors hover:text-text"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="#telemetry"
                  className="text-sm text-muted transition-colors hover:text-text"
                >
                  Telemetry disclosure
                </a>
              </li>
              <li>
                <span className="text-sm text-faint">MIT License</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-line pt-6 sm:flex-row sm:items-center">
          <p className="font-mono text-xs text-faint">{host}</p>
          <p className="font-mono text-xs text-faint">
            Built for people who ship. MIT Licensed.
          </p>
        </div>
      </div>
    </footer>
  );
}

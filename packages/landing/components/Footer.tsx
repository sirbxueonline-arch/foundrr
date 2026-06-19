import { GITHUB_URL } from "@/lib/config";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-5xl px-5 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <p className="font-display font-semibold text-text">Founder</p>
          <p className="mt-1 font-mono text-xs text-faint">
            Supervise your AI coding agents from anywhere.
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-cool transition-colors"
          >
            GitHub
          </a>
          <a
            href="#telemetry"
            className="text-muted hover:text-cool transition-colors"
          >
            Telemetry disclosure
          </a>
          <span className="font-mono text-xs text-faint">MIT License</span>
        </nav>
      </div>
    </footer>
  );
}

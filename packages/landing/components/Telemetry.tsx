const SHARED = [
  "An opaque, random install id (not tied to you or your machine)",
  "Which agent you used (e.g. claude-code)",
  "Token counts and estimated cost",
];

const NEVER = [
  "Your code, file paths, or directory names",
  "Your prompts or any agent output",
  "IP addresses, machine names, or anything identifying",
];

export function Telemetry() {
  return (
    <section
      id="telemetry"
      className="border-t border-line"
    >
      <div className="mx-auto max-w-3xl px-5 py-20 sm:py-28">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-cool mb-2">
          // telemetry disclosure
        </p>
        <h2 className="font-display text-3xl sm:text-4xl font-semibold">
          The honest part
        </h2>
        <p className="mt-3 text-muted leading-relaxed">
          The counters above are real because Founder shares{" "}
          <strong className="text-text">anonymous aggregate usage</strong> by
          default. That is how the global leaderboard exists. Here is exactly
          what that means.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-[color-mix(in_srgb,var(--ok)_35%,var(--line))] bg-panel p-5">
            <h3 className="flex items-center gap-2 font-medium text-ok">
              <span aria-hidden>↑</span> What is shared
            </h3>
            <ul className="mt-3 space-y-2">
              {SHARED.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-muted">
                  <span className="text-ok shrink-0" aria-hidden>
                    +
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-[color-mix(in_srgb,var(--alert)_35%,var(--line))] bg-panel p-5">
            <h3 className="flex items-center gap-2 font-medium text-alert">
              <span aria-hidden>×</span> Never shared
            </h3>
            <ul className="mt-3 space-y-2">
              {NEVER.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-muted">
                  <span className="text-alert shrink-0" aria-hidden>
                    −
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-line bg-[color-mix(in_srgb,var(--panel)_60%,transparent)] p-5">
          <p className="text-sm text-muted">
            Want zero telemetry? Opt out anytime with one command:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md border border-line bg-void px-4 py-3 font-mono text-sm text-signal">
            <code>mc telemetry share off</code>
          </pre>
          <p className="mt-3 text-xs text-faint">
            It is opt-out, on by default, and fully transparent — the daemon is
            open source, so you can read exactly what it sends.
          </p>
        </div>
      </div>
    </section>
  );
}

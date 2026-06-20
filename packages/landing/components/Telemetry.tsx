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

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mt-0.5 shrink-0 text-ok"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mt-0.5 shrink-0 text-alert"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function Telemetry() {
  return (
    <section id="telemetry" className="border-t border-line">
      <div className="mx-auto max-w-3xl px-5 py-20 sm:py-28">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.24em] text-cool">
          // telemetry disclosure
        </p>
        <h2 className="mt-2 font-display text-3xl sm:text-4xl font-semibold tracking-tight">
          The honest part
        </h2>
        <p className="mt-3 text-muted leading-relaxed">
          The counters above are real because Founder shares{" "}
          <strong className="text-text">anonymous aggregate usage</strong> by
          default. That is how the global leaderboard exists. Here is exactly
          what that means.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-[color-mix(in_srgb,var(--ok)_30%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_5%,var(--panel))] p-6">
            <h3 className="flex items-center gap-2 font-display font-semibold text-ok">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ok)_18%,transparent)]">
                <CheckIcon />
              </span>
              What is shared
            </h3>
            <ul className="mt-4 space-y-3">
              {SHARED.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-muted">
                  <CheckIcon />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-[color-mix(in_srgb,var(--alert)_30%,var(--line))] bg-[color-mix(in_srgb,var(--alert)_5%,var(--panel))] p-6">
            <h3 className="flex items-center gap-2 font-display font-semibold text-alert">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--alert)_18%,transparent)]">
                <CrossIcon />
              </span>
              Never shared
            </h3>
            <ul className="mt-4 space-y-3">
              {NEVER.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-muted">
                  <CrossIcon />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-line bg-[color-mix(in_srgb,var(--panel)_55%,transparent)] p-6">
          <p className="text-sm text-muted">
            Want zero telemetry? Opt out anytime with one command:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-void px-4 py-3 font-mono text-sm text-signal">
            <code>
              <span className="select-none text-faint">$ </span>mc telemetry
              share off
            </code>
          </pre>
          <p className="mt-3 text-xs text-faint leading-relaxed">
            It is opt-out, on by default, and fully transparent — the daemon is
            open source, so you can read exactly what it sends.
          </p>
        </div>
      </div>
    </section>
  );
}

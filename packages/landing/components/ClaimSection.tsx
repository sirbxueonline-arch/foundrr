import { Reveal } from "@/components/Reveal";
import { MeshWhisper } from "@/components/Ambient";

interface ComparisonStep {
  readonly without: string;
  readonly with: string;
}

// Read as paired rows so the two columns stay aligned line-for-line, the way
// Aqua sets identical prompt text side by side to make the contrast obvious.
const STEPS: ReadonlyArray<ComparisonStep> = [
  {
    without: "An agent stalls on a permission prompt",
    with: "The prompt lands on your phone",
  },
  {
    without: "It sits idle, waiting on you",
    with: "One tap approves it",
  },
  {
    without: "You're away from the keyboard",
    with: "The agent keeps moving",
  },
];

/**
 * Light, centered — modeled on Aqua's claim + comparison section. A confident
 * one-line headline, a small muted subline, and a single pill, then a true
 * side-by-side comparison: two columns sharing one hairline frame, split by a
 * single center hairline (not two separate cards). Each column carries a small
 * header label + state, exactly like Aqua's "Using Aqua / Using Keyboard"
 * panes. The "with" side is the only one that leans to full-ink emphasis.
 */
export function ClaimSection() {
  return (
    <section className="relative overflow-hidden border-t border-hairline bg-canvas">
      <MeshWhisper />
      <div className="relative mx-auto max-w-4xl px-5 py-24 sm:py-32">
        <Reveal className="flex flex-col items-center text-center">
          <h2 className="max-w-2xl font-display text-3xl font-light leading-[1.15] tracking-[-0.02em] text-ink sm:text-[2.9rem] sm:leading-[1.1]">
            Everything your machine is doing. On one screen.
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-ink-muted">
            Stop babysitting terminals. See every agent at a glance and unblock
            them in a tap — without invented dashboards or guesswork.
          </p>
          <a
            href="#how-it-works"
            className="mt-7 inline-flex items-center rounded-full border border-hairline bg-canvas-raised px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:border-ink/25"
          >
            See how it works
          </a>
        </Reveal>

        {/* True side-by-side comparison: one hairline frame, one center divide. */}
        <Reveal delay={0.08} className="mt-16">
          <div className="overflow-hidden rounded-2xl border border-hairline bg-canvas-raised">
            <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-hairline">
              {/* Without Founder */}
              <div className="border-b border-hairline p-7 sm:border-b-0 sm:p-9">
                <div className="flex items-baseline justify-between">
                  <p className="font-mono text-[0.66rem] uppercase tracking-[0.18em] text-ink-faint">
                    Without Founder
                  </p>
                  <p className="font-mono text-[0.66rem] tracking-[0.04em] text-ink-faint">
                    blocked
                  </p>
                </div>
                <ul className="mt-6 space-y-3.5">
                  {STEPS.map((step) => (
                    <li
                      key={step.without}
                      className="flex gap-3 text-[0.95rem] leading-relaxed text-ink-muted"
                    >
                      <span
                        className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint"
                        aria-hidden
                      />
                      <span>{step.without}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* With Founder */}
              <div className="p-7 sm:p-9">
                <div className="flex items-baseline justify-between">
                  <p className="font-mono text-[0.66rem] uppercase tracking-[0.18em] text-ink">
                    With Founder
                  </p>
                  <p className="inline-flex items-center gap-1.5 font-mono text-[0.66rem] tracking-[0.04em] text-ink">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full bg-ink"
                      aria-hidden
                    />
                    live
                  </p>
                </div>
                <ul className="mt-6 space-y-3.5">
                  {STEPS.map((step) => (
                    <li
                      key={step.with}
                      className="flex gap-3 text-[0.95rem] leading-relaxed text-ink"
                    >
                      <span
                        className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ink"
                        aria-hidden
                      />
                      <span>{step.with}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

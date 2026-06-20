import { Reveal } from "@/components/Reveal";
import { MeshWhisper } from "@/components/Ambient";

const STEPS: ReadonlyArray<{ n: string; title: string; body: string }> = [
  {
    n: "01",
    title: "Install the daemon",
    body: "One command spins up a local command center on your dev box. It owns no cloud and binds to localhost by default.",
  },
  {
    n: "02",
    title: "Point it at your agent",
    body: "Hook up Claude Code or any top coding agent. Founder watches sessions, files edited, commands run, and token spend.",
  },
  {
    n: "03",
    title: "Supervise from anywhere",
    body: "Approve or deny permission prompts from your phone over Telegram. Watch-it-work becomes supervise-it-from-the-bus.",
  },
];

/**
 * Light, centered "how it works" — three numbered steps as hairline rows with
 * lots of negative space. Mono step numbers, thin headline.
 */
export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative overflow-hidden border-t border-hairline bg-canvas">
      <MeshWhisper />
      <div className="relative mx-auto max-w-4xl px-5 py-24 sm:py-32">
        <Reveal>
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-ink-faint">
            How it works
          </p>
          <h2 className="mt-4 max-w-2xl font-display text-3xl font-light leading-[1.15] tracking-[-0.02em] text-ink sm:text-5xl">
            Install. Point it at your agent. Walk away.
          </h2>
        </Reveal>

        <ol className="mt-14">
          {STEPS.map((step, i) => (
            <Reveal
              key={step.n}
              delay={i * 0.07}
              as="li"
              className="group grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-hairline py-8 transition-colors duration-300 hover:border-ink/20 sm:gap-x-10"
            >
              <span className="font-mono text-sm text-ink-faint transition-colors duration-300 group-hover:text-ink">
                {step.n}
              </span>
              <h3 className="text-lg font-medium text-ink">{step.title}</h3>
              <span aria-hidden />
              <p className="max-w-xl text-[0.95rem] leading-relaxed text-ink-muted">
                {step.body}
              </p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

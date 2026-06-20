import { MODELS } from "@/lib/models";
import { logoForKey } from "@/components/BrandLogos";

const STEPS = [
  {
    n: "01",
    title: "Install the daemon",
    body: "One command spins up a local command center on your dev box. It owns no cloud and binds to localhost by default.",
  },
  {
    n: "02",
    title: "Pick your model",
    body: "Hook up any of the top coding agents. Founder watches sessions, files edited, commands run, and token spend.",
  },
  {
    n: "03",
    title: "Supervise from anywhere",
    body: "Approve or deny permission prompts from your phone over Telegram. Turn watch-it-work into supervise-it-from-the-bus.",
  },
];

export function ModelsGrid() {
  return (
    <section
      id="how-it-works"
      className="border-t border-line bg-[color-mix(in_srgb,var(--panel)_22%,transparent)]"
    >
      <div className="mx-auto max-w-5xl px-5 py-20 sm:py-28">
        <header className="mb-12">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.24em] text-cool">
            // how it works
          </p>
          <h2 className="mt-2 font-display text-3xl sm:text-5xl font-bold tracking-[-0.02em]">
            Pick your model. Watch it work.
          </h2>
          <p className="mt-3 max-w-2xl text-muted leading-relaxed">
            Three steps from install to supervising your agents from the palm of
            your hand.
          </p>
        </header>

        <div className="mb-20 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              className="card-hover relative rounded-xl border border-line bg-panel p-6 hover:border-[color-mix(in_srgb,var(--signal)_30%,var(--line))]"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--signal)_35%,var(--line))] bg-[color-mix(in_srgb,var(--signal)_10%,transparent)] font-mono text-sm font-semibold text-signal">
                  {step.n}
                </span>
                {i < STEPS.length - 1 && (
                  <span
                    className="hidden h-px flex-1 bg-gradient-to-r from-line to-transparent sm:block"
                    aria-hidden
                  />
                )}
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold text-text">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">
                {step.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.24em] text-faint">
            // supported agents
          </p>
          <p className="font-mono text-[0.7rem] text-faint">
            {MODELS.length} agents · Claude Code precise, others best-effort
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {MODELS.map((model) => {
            const Logo = logoForKey(model.key);
            return (
              <li
                key={model.key}
                className="card-hover group flex items-center gap-3 rounded-xl border border-line bg-panel px-3.5 py-3 hover:border-[var(--faint)]"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-transform group-hover:scale-110"
                  style={{
                    color: model.color,
                    borderColor: `color-mix(in srgb, ${model.color} 26%, var(--line))`,
                    backgroundColor: `color-mix(in srgb, ${model.color} 12%, transparent)`,
                  }}
                  aria-hidden
                >
                  <Logo size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {model.name}
                  </p>
                  <p className="truncate text-xs text-faint">{model.vendor}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

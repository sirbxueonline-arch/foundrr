import { MODELS } from "@/lib/models";

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
      className="border-t border-line bg-[color-mix(in_srgb,var(--panel)_30%,transparent)]"
    >
      <div className="mx-auto max-w-5xl px-5 py-20 sm:py-28">
        <header className="mb-12">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-cool mb-2">
            // how it works
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold">
            Pick your model. Watch it work.
          </h2>
        </header>

        <div className="grid gap-4 sm:grid-cols-3 mb-16">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="rounded-lg border border-line bg-panel p-5"
            >
              <span className="font-mono text-sm text-signal">{step.n}</span>
              <h3 className="mt-2 font-medium text-text">{step.title}</h3>
              <p className="mt-1.5 text-sm text-muted leading-relaxed">
                {step.body}
              </p>
            </div>
          ))}
        </div>

        <p className="font-mono text-xs uppercase tracking-[0.22em] text-faint mb-4">
          // supported agents
        </p>
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {MODELS.map((model) => (
            <li
              key={model.key}
              className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3.5 py-3"
            >
              <span
                className="h-8 w-8 shrink-0 rounded-md flex items-center justify-center font-mono text-sm font-semibold"
                style={{
                  color: model.color,
                  backgroundColor: `color-mix(in srgb, ${model.color} 14%, transparent)`,
                }}
                aria-hidden
              >
                {model.name.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text truncate">
                  {model.name}
                </p>
                <p className="text-xs text-faint truncate">{model.vendor}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

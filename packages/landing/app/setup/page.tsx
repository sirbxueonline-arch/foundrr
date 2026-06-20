import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/CodeBlock";
import { GITHUB_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Set up Founder in 2 minutes",
  description:
    "Install Founder, wire up your AI coding agent, and start supervising from anywhere. Copy-paste commands for Claude Code, Codex, Gemini CLI, Aider, and Amazon Q.",
  alternates: { canonical: "/setup" },
  openGraph: {
    title: "Set up Founder in 2 minutes",
    description:
      "Install Founder, wire up your AI coding agent, and start supervising from anywhere.",
    type: "article",
    url: "https://foundrr.online/setup",
    siteName: "Founder",
  },
};

const AMAZON_Q_DOCS_URL =
  "https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line-installing.html";
const CLAUDE_CODE_URL = "https://claude.com/claude-code";

/** Ordered, copy-able install steps. Each renders as a numbered card. */
const INSTALL_STEPS: ReadonlyArray<{
  command: string;
  title: string;
  detail: string;
}> = [
  {
    title: "Clone the repo",
    command: "git clone https://github.com/sirbxueonline-arch/foundrr",
    detail: "Grab the source. It's open and MIT-licensed.",
  },
  {
    title: "Enter the directory",
    command: "cd foundrr",
    detail: "Everything below runs from the repo root.",
  },
  {
    title: "Install dependencies",
    command: "npm install",
    detail: "Pulls the workspace packages — daemon, dashboard, and landing.",
  },
  {
    title: "Build",
    command: "npm run build",
    detail: "Compiles the daemon and dashboard so the CLI is ready to run.",
  },
  {
    title: "Link the CLI",
    command: "npm link",
    detail: "Puts the global mc command on your PATH.",
  },
  {
    title: "Run setup",
    command: "mc setup",
    detail:
      "Generates your token, installs Claude Code hooks, and auto-enables telemetry recording. Safe to re-run.",
  },
  {
    title: "Start the daemon",
    command: "mc start",
    detail:
      "Prints your dashboard URL with a ?token=… on it. Open it in your browser.",
  },
];

/** Terminal coding agents — each with a one-line install command. */
const TERMINAL_AGENTS: ReadonlyArray<{
  name: string;
  command: string;
  note?: string;
  link?: { href: string; label: string };
}> = [
  {
    name: "Claude Code",
    command: "npm install -g @anthropic-ai/claude-code",
    link: { href: CLAUDE_CODE_URL, label: "claude.com/claude-code" },
  },
  {
    name: "OpenAI Codex",
    command: "npm install -g @openai/codex",
  },
  {
    name: "Gemini CLI",
    command: "npm install -g @google/gemini-cli",
  },
  {
    name: "Aider",
    command: "pipx install aider-chat",
  },
];

function StepNumber({ n }: { n: number }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--signal)_45%,var(--line))] bg-[color-mix(in_srgb,var(--signal)_10%,transparent)] font-mono text-sm font-semibold text-signal"
      aria-hidden
    >
      {n}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-signal">
        {eyebrow}
      </p>
      <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-[-0.02em] text-text">
        {title}
      </h2>
      {children ? (
        <p className="mt-4 text-base sm:text-lg text-muted leading-relaxed">
          {children}
        </p>
      ) : null}
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="inline-block"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6M10 14 21 3" />
    </svg>
  );
}

function ArrowLeftIcon() {
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
      className="transition-transform group-hover:-translate-x-0.5"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export default function SetupPage() {
  return (
    <main>
      {/* ── Top nav: minimal, back to home ─────────────────────────────── */}
      <div className="sticky top-0 z-50 border-b border-line/80 bg-[color-mix(in_srgb,var(--void)_72%,transparent)] backdrop-blur-md supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--void)_55%,transparent)]">
        <nav className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3.5">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-text"
          >
            <ArrowLeftIcon />
            Back to home
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="pulse-dot absolute inset-0" aria-hidden />
              <span
                className="relative inline-block h-2 w-2 rounded-full bg-signal"
                aria-hidden
              />
            </span>
            <span className="font-display text-[0.95rem] font-semibold tracking-tight text-text">
              Founder
            </span>
          </div>
        </nav>
      </div>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden border-b border-line">
        <div
          className="absolute inset-0 console-grid pointer-events-none"
          aria-hidden
        />
        <div
          className="absolute inset-0 hero-glow pointer-events-none"
          aria-hidden
        />
        <div className="relative mx-auto max-w-4xl px-5 pt-20 pb-14 sm:pt-28 sm:pb-20">
          <div className="rise inline-flex items-center gap-2 rounded-full border border-line bg-[color-mix(in_srgb,var(--panel)_75%,transparent)] px-3.5 py-1.5 backdrop-blur-sm">
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted">
              Get started
            </span>
          </div>
          <h1
            className="rise mt-7 font-display text-5xl sm:text-7xl font-bold tracking-[-0.03em] leading-[0.98]"
            style={{ animationDelay: "60ms" }}
          >
            <span className="bg-gradient-to-b from-text to-[color-mix(in_srgb,var(--text)_55%,var(--void))] bg-clip-text text-transparent">
              Set up Founder in 2 minutes
            </span>
          </h1>
          <p
            className="rise mt-6 max-w-2xl text-lg sm:text-xl text-muted leading-relaxed text-balance"
            style={{ animationDelay: "120ms" }}
          >
            Clone, build, link, and start. Then point your AI coding agent at it
            and supervise from anywhere — your terminal, your phone, your LAN.
          </p>
          <div
            className="rise mt-9 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "180ms" }}
          >
            <a
              href="#install"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-signal px-6 py-3 font-semibold text-[#0d1014] transition-transform hover:-translate-y-0.5 box-glow-signal"
            >
              Start installing
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-[color-mix(in_srgb,var(--panel)_70%,transparent)] px-6 py-3 font-medium text-text backdrop-blur-sm transition-colors hover:border-[var(--cool)] hover:text-cool"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </header>

      {/* ── 1. Install Founder ─────────────────────────────────────────── */}
      <section
        id="install"
        className="mx-auto max-w-4xl px-5 py-16 sm:py-24 scroll-mt-20"
      >
        <SectionHeading eyebrow="Step 1" title="Install Founder">
          Seven commands, top to bottom. Each step has a copy button — paste it
          into your terminal and move on.
        </SectionHeading>

        <ol className="mt-10 space-y-4">
          {INSTALL_STEPS.map((step, i) => (
            <li
              key={step.command}
              className="card-hover rounded-xl border border-line bg-panel p-5 sm:p-6"
            >
              <div className="flex items-start gap-4">
                <StepNumber n={i + 1} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-base font-semibold text-text">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted leading-relaxed">
                    {step.detail}
                  </p>
                  <div className="mt-4">
                    <CodeBlock code={step.command} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-xl border border-[color-mix(in_srgb,var(--signal)_30%,var(--line))] bg-[color-mix(in_srgb,var(--signal)_7%,transparent)] p-5">
          <p className="text-sm text-text leading-relaxed">
            <span className="font-semibold text-signal">Heads up:</span>{" "}
            restart Claude Code after your first{" "}
            <code className="font-mono text-[0.85em] text-text">mc start</code>{" "}
            so the telemetry env applies and your tokens start recording.
          </p>
        </div>
      </section>

      {/* ── 2. Install your AI agent ───────────────────────────────────── */}
      <section className="border-t border-line bg-void-2/40">
        <div className="mx-auto max-w-4xl px-5 py-16 sm:py-24">
          <SectionHeading eyebrow="Step 2" title="Install your AI agent">
            Don&apos;t have the agent installed? Founder tells you right in the
            terminal — here&apos;s how to get each one.
          </SectionHeading>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {TERMINAL_AGENTS.map((agent) => (
              <div
                key={agent.name}
                className="card-hover flex flex-col rounded-xl border border-line bg-panel p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-base font-semibold text-text">
                    {agent.name}
                  </h3>
                  {agent.link ? (
                    <a
                      href={agent.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[0.7rem] text-faint transition-colors hover:text-cool"
                    >
                      {agent.link.label}
                      <ExternalIcon />
                    </a>
                  ) : null}
                </div>
                <div className="mt-4">
                  <CodeBlock code={agent.command} prompt="" />
                </div>
              </div>
            ))}

            {/* Amazon Q — docs link instead of an inline command */}
            <div className="card-hover flex flex-col rounded-xl border border-line bg-panel p-5 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-base font-semibold text-text">
                  Amazon Q
                </h3>
              </div>
              <p className="mt-2 text-sm text-muted leading-relaxed">
                The Amazon Q Developer CLI installs per-platform. Follow AWS&apos;s
                official guide for your OS.
              </p>
              <a
                href={AMAZON_Q_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg border border-line bg-[color-mix(in_srgb,var(--void-2)_88%,transparent)] px-4 py-2.5 text-sm font-medium text-text transition-colors hover:border-[var(--cool)] hover:text-cool"
              >
                AWS Amazon Q Developer CLI docs
                <ExternalIcon />
              </a>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-line bg-[color-mix(in_srgb,var(--panel)_60%,transparent)] p-5">
            <p className="text-sm text-muted leading-relaxed">
              <span className="font-medium text-text">IDE-based tools</span> —
              Cursor, GitHub Copilot, Cline, Windsurf, and Continue run inside
              your editor, not as a standalone terminal agent. Founder supervises
              terminal agents, so there&apos;s nothing to install on the CLI for
              those.
            </p>
          </div>
        </div>
      </section>

      {/* ── 3. Pick your model & supervise from anywhere ───────────────── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-4xl px-5 py-16 sm:py-24">
          <SectionHeading
            eyebrow="Step 3"
            title="Pick your model & supervise from anywhere"
          >
            Choose the agent you run, then leash it to your phone and reach it
            over your network.
          </SectionHeading>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-line bg-panel p-5">
              <h3 className="font-display text-base font-semibold text-text">
                Pick your model
              </h3>
              <p className="mt-1 text-sm text-muted leading-relaxed">
                Set it from the CLI, or use the model picker in the dashboard
                header.
              </p>
              <div className="mt-4">
                <CodeBlock code="mc config model <key>" prompt="" />
              </div>
            </div>

            <div className="rounded-xl border border-line bg-panel p-5">
              <h3 className="font-display text-base font-semibold text-text">
                Leash to your phone
              </h3>
              <p className="mt-1 text-sm text-muted leading-relaxed">
                Link the shared bot, then message{" "}
                <span className="font-mono text-[0.85em] text-text">
                  @foundrremotebot
                </span>{" "}
                to get remote Approve / Deny on your phone.
              </p>
              <div className="mt-4">
                <CodeBlock code="mc telegram link" prompt="" />
              </div>
            </div>

            <div className="rounded-xl border border-line bg-panel p-5">
              <h3 className="font-display text-base font-semibold text-text">
                LAN / Tailscale access
              </h3>
              <p className="mt-1 text-sm text-muted leading-relaxed">
                Bind to all interfaces so you can reach the dashboard from
                another device on your network.
              </p>
              <div className="mt-4">
                <CodeBlock code="HOST=0.0.0.0 mc start" prompt="" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Telemetry (transparent) ─────────────────────────────────── */}
      <section className="border-t border-line bg-void-2/40">
        <div className="mx-auto max-w-4xl px-5 py-16 sm:py-24">
          <SectionHeading eyebrow="Transparent by design" title="Telemetry">
            Founder shares anonymous usage — your install id, the model you run,
            and token/cost counts. Never your code, file paths, or prompts.
          </SectionHeading>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel p-6">
              <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-ok">
                On by default
              </p>
              <p className="mt-3 text-sm text-muted leading-relaxed">
                These anonymous counts power the public leaderboard on the home
                page — the global token spend you can watch tick up in real
                time. Nothing that could identify you or your work ever leaves
                your machine.
              </p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-6">
              <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted">
                Opt out anytime
              </p>
              <p className="mt-3 text-sm text-muted leading-relaxed">
                One command turns it off completely. Nothing is reported after
                that.
              </p>
              <div className="mt-4">
                <CodeBlock code="mc telemetry share off" prompt="" />
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="group inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-6 py-3 font-medium text-text transition-colors hover:border-[var(--signal)] hover:text-signal"
            >
              <ArrowLeftIcon />
              Back to home
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-[color-mix(in_srgb,var(--panel)_70%,transparent)] px-6 py-3 font-medium text-text transition-colors hover:border-[var(--cool)] hover:text-cool"
            >
              Read the source
              <ExternalIcon />
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

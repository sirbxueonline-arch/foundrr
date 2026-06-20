import type { Metadata } from "next";
import Link from "next/link";

import { AgentInstaller } from "@/components/AgentInstaller";
import { CodeBlock } from "@/components/CodeBlock";
import { OnThisPage, type TocItem } from "@/components/OnThisPage";
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

/** Ordered, copy-able install steps. Each renders as a numbered row. */
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

/** Prerequisites surfaced as a callout above the install steps. */
const PREREQS: ReadonlyArray<{ label: string; detail: string }> = [
  { label: "Node.js 18+", detail: "with npm — runs the daemon and dashboard" },
  { label: "Git", detail: "to clone the repository" },
  { label: "A terminal AI agent", detail: "Claude Code, Codex, Gemini & more" },
];

/** The three top-level phases, surfaced as a stepper at the top of the page. */
const PHASES: ReadonlyArray<{ n: string; label: string; href: string }> = [
  { n: "01", label: "Install Founder", href: "#install" },
  { n: "02", label: "Install your agent", href: "#agent" },
  { n: "03", label: "Supervise anywhere", href: "#supervise" },
];

/** Anchors for the right-hand "On this page" rail (scroll-spy). */
const TOC: readonly TocItem[] = [
  { id: "install", label: "Install Founder", step: "01" },
  { id: "agent", label: "Install your agent", step: "02" },
  { id: "supervise", label: "Supervise anywhere", step: "03" },
  { id: "telemetry", label: "Telemetry" },
];

function StepNumber({ n }: { n: number }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--signal)_45%,var(--line))] bg-[color-mix(in_srgb,var(--signal)_10%,transparent)] font-mono text-sm font-semibold text-signal"
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

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-ok"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function SetupPage() {
  return (
    <main>
      {/* ── Top nav: minimal, back to home ─────────────────────────────── */}
      <div className="sticky top-0 z-50 border-b border-line/80 bg-[color-mix(in_srgb,var(--void)_72%,transparent)] backdrop-blur-md supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--void)_55%,transparent)]">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 lg:px-8">
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
        <div className="relative mx-auto max-w-7xl px-5 pt-16 pb-14 sm:pt-24 sm:pb-18 lg:px-8">
          <div className="grid items-end gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="rise inline-flex items-center gap-2 rounded-full border border-line bg-[color-mix(in_srgb,var(--panel)_75%,transparent)] px-3.5 py-1.5 backdrop-blur-sm">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="pulse-dot absolute inset-0" aria-hidden />
                  <span
                    className="relative inline-block h-1.5 w-1.5 rounded-full bg-signal"
                    aria-hidden
                  />
                </span>
                <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted">
                  Get started · ~2 min
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
                Clone, build, link, and start. Then point your AI coding agent at
                it and supervise from anywhere — your terminal, your phone, your
                LAN.
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

            {/* Hero-side quickstart card — OpenAI-docs "developer quickstart". */}
            <div
              className="rise rounded-2xl border border-line bg-[color-mix(in_srgb,var(--panel)_70%,transparent)] p-5 backdrop-blur-sm"
              style={{ animationDelay: "150ms" }}
            >
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-cool">
                Quickstart
              </p>
              <p className="mt-2 text-sm text-muted leading-relaxed">
                Already cloned and built? Jump straight to the daemon.
              </p>
              <div className="mt-4 space-y-2">
                <CodeBlock code="mc setup" prompt="$" />
                <CodeBlock code="mc start" prompt="$" />
              </div>
              <div className="mt-4 flex items-center gap-2 border-t border-line/70 pt-3 font-mono text-[0.7rem] text-faint">
                <CheckIcon />
                Opens your dashboard with a one-time token
              </div>
            </div>
          </div>

          {/* Phase stepper — three jump links that double as a progress map. */}
          <nav
            aria-label="Setup phases"
            className="rise mt-12 grid gap-2.5 sm:grid-cols-3"
            style={{ animationDelay: "240ms" }}
          >
            {PHASES.map((phase, i) => (
              <a
                key={phase.n}
                href={phase.href}
                className="card-hover group flex items-center gap-3 rounded-xl border border-line bg-[color-mix(in_srgb,var(--panel)_60%,transparent)] px-4 py-3.5 backdrop-blur-sm hover:border-[color-mix(in_srgb,var(--signal)_35%,var(--line))]"
              >
                <span className="font-mono text-sm font-semibold text-signal">
                  {phase.n}
                </span>
                <span className="text-sm font-medium text-text">
                  {phase.label}
                </span>
                {i < PHASES.length - 1 ? (
                  <span
                    className="ml-auto hidden h-px w-6 bg-gradient-to-r from-line to-transparent sm:block"
                    aria-hidden
                  />
                ) : null}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Three-column docs body: contents rail · content · on-this-page ─ */}
      <div className="mx-auto grid max-w-7xl gap-x-10 px-5 lg:grid-cols-[14rem_minmax(0,1fr)] lg:px-8 xl:grid-cols-[14rem_minmax(0,1fr)_13rem]">
        {/* Left contents rail — sticky stepper (desktop only). */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 py-16">
            <p className="mb-4 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-faint">
              Contents
            </p>
            <ol className="space-y-1">
              {PHASES.map((phase) => (
                <li key={phase.n}>
                  <a
                    href={phase.href}
                    className="group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--panel)_60%,transparent)] hover:text-text"
                  >
                    <span className="font-mono text-xs text-faint group-hover:text-signal">
                      {phase.n}
                    </span>
                    {phase.label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="#telemetry"
                  className="group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--panel)_60%,transparent)] hover:text-text"
                >
                  <span className="font-mono text-xs text-faint group-hover:text-signal">
                    ··
                  </span>
                  Telemetry
                </a>
              </li>
            </ol>

            <div className="mt-8 rounded-xl border border-line bg-[color-mix(in_srgb,var(--panel)_45%,transparent)] p-4">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-cool">
                Need help?
              </p>
              <p className="mt-2 text-xs text-muted leading-relaxed">
                The CLI tells you exactly what to run next at every step.
              </p>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-muted transition-colors hover:text-cool"
              >
                Open issues
                <ExternalIcon />
              </a>
            </div>
          </div>
        </aside>

        {/* Center content column. */}
        <div className="min-w-0">
          {/* ── 1. Install Founder ─────────────────────────────────────── */}
          <section id="install" className="py-16 sm:py-20 scroll-mt-24">
            <SectionHeading eyebrow="Step 1" title="Install Founder">
              Seven commands, top to bottom. Each step has a copy button — paste
              it into your terminal and move on.
            </SectionHeading>

            {/* Prerequisites callout — Mintlify "Prerequisites" box. */}
            <div className="mt-8 rounded-xl border border-line bg-[color-mix(in_srgb,var(--panel)_45%,transparent)] p-5">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-cool">
                Prerequisites
              </p>
              <ul className="mt-3 grid gap-3 sm:grid-cols-3">
                {PREREQS.map((req) => (
                  <li key={req.label} className="flex items-start gap-2.5">
                    <CheckIcon />
                    <span>
                      <span className="block text-sm font-medium text-text">
                        {req.label}
                      </span>
                      <span className="block text-xs text-faint leading-relaxed">
                        {req.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Numbered steps with a continuous connector spine on the left. */}
            <ol className="relative mt-8 space-y-4 sm:before:absolute sm:before:left-[1.125rem] sm:before:top-6 sm:before:bottom-6 sm:before:w-px sm:before:bg-gradient-to-b sm:before:from-[color-mix(in_srgb,var(--signal)_35%,var(--line))] sm:before:via-line sm:before:to-transparent">
              {INSTALL_STEPS.map((step, i) => (
                <li
                  key={step.command}
                  className="card-hover relative rounded-xl border border-line bg-panel p-5 sm:p-6"
                >
                  <div className="flex items-start gap-4">
                    <span className="relative z-10 bg-panel sm:-ml-0.5">
                      <StepNumber n={i + 1} />
                    </span>
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
                <code className="font-mono text-[0.85em] text-text">
                  mc start
                </code>{" "}
                so the telemetry env applies and your tokens start recording.
              </p>
            </div>
          </section>

          {/* ── 2. Install your AI agent (tabbed picker) ───────────────── */}
          <section
            id="agent"
            className="border-t border-line py-16 sm:py-20 scroll-mt-24"
          >
            <SectionHeading eyebrow="Step 2" title="Install your AI agent">
              Don&apos;t have the agent installed? Founder tells you right in the
              terminal. Pick yours below for the exact one-line install.
            </SectionHeading>

            <div className="mt-8">
              <AgentInstaller />
            </div>
          </section>

          {/* ── 3. Pick your model & supervise from anywhere ───────────── */}
          <section
            id="supervise"
            className="border-t border-line py-16 sm:py-20 scroll-mt-24"
          >
            <SectionHeading
              eyebrow="Step 3"
              title="Pick your model & supervise from anywhere"
            >
              Choose the agent you run, then leash it to your phone and reach it
              over your network.
            </SectionHeading>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="card-hover rounded-xl border border-line bg-panel p-5 sm:p-6">
                <h3 className="font-display text-base font-semibold text-text">
                  Pick your model
                </h3>
                <p className="mt-1 text-sm text-muted leading-relaxed">
                  Set it from the CLI, or use the model picker in the dashboard
                  header.
                </p>
                <div className="mt-4">
                  <CodeBlock code="mc config model <key>" prompt="$" />
                </div>
              </div>

              <div className="card-hover rounded-xl border border-line bg-panel p-5 sm:p-6">
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
                  <CodeBlock code="mc telegram link" prompt="$" />
                </div>
              </div>

              <div className="card-hover rounded-xl border border-line bg-panel p-5 sm:p-6">
                <h3 className="font-display text-base font-semibold text-text">
                  LAN / Tailscale access
                </h3>
                <p className="mt-1 text-sm text-muted leading-relaxed">
                  Bind to all interfaces so you can reach the dashboard from
                  another device on your network.
                </p>
                <div className="mt-4">
                  <CodeBlock code="HOST=0.0.0.0 mc start" prompt="$" />
                </div>
              </div>
            </div>
          </section>

          {/* ── 4. Telemetry (transparent) ─────────────────────────────── */}
          <section
            id="telemetry"
            className="border-t border-line py-16 sm:py-20 scroll-mt-24"
          >
            <SectionHeading eyebrow="Transparent by design" title="Telemetry">
              Founder shares anonymous usage — your install id, the model you
              run, and token/cost counts. Never your code, file paths, or
              prompts.
            </SectionHeading>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
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
                  <CodeBlock code="mc telemetry share off" prompt="$" />
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
          </section>
        </div>

        {/* Right "On this page" rail (scroll-spy, xl only). */}
        <aside className="hidden xl:block">
          <div className="sticky top-24 py-16">
            <OnThisPage items={TOC} />
          </div>
        </aside>
      </div>
    </main>
  );
}

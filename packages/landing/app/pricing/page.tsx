import type { Metadata } from "next";

import { AnnouncementBar } from "@/components/AnnouncementBar";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Foundrr — Pricing",
  description:
    "Foundrr is free forever on your own machine. Pro and Team add a reliable cloud leash, history sync, and governance.",
  alternates: { canonical: "/pricing" },
};

interface Tier {
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  features: ReadonlyArray<string>;
  plan?: "pro" | "team";
  highlight?: boolean;
}

const TIERS: ReadonlyArray<Tier> = [
  {
    name: "Local",
    price: "$0",
    cadence: "free forever",
    blurb: "Everything on your own machine.",
    features: [
      "Live agent supervision",
      "Dev servers + one-tap preview",
      "Built-in multi-AI terminal",
      "The Telegram leash (best-effort)",
    ],
  },
  {
    name: "Pro",
    price: "$7",
    cadence: "per month",
    blurb: "For the solo dev who lives on the leash.",
    features: [
      "Reliable leash — priority delivery",
      "Cloud history sync across devices",
      "Multi-machine dashboards",
      "Priority support",
    ],
    plan: "pro",
    highlight: true,
  },
  {
    name: "Team",
    price: "$15",
    cadence: "per seat / month",
    blurb: "Governance for AI agents at work.",
    features: ["Everything in Pro", "Approval audit log", "Roles + SSO", "Policy auto-deny rules"],
    plan: "team",
  },
];

function Check() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mt-0.5 shrink-0"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <>
      <AnnouncementBar />
      <Nav />
      <main className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <div className="text-center">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-ink-faint">Pricing</p>
          <h1 className="mt-4 font-display text-4xl font-light tracking-[-0.02em] text-ink sm:text-5xl">
            Start free. Upgrade when the leash earns it.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-muted">
            Foundrr is free forever on your own machine. Pro and Team add a reliable cloud leash,
            history sync, and team governance.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className="flex flex-col rounded-2xl border bg-canvas-raised p-7"
              style={{
                borderColor: tier.highlight
                  ? "color-mix(in srgb, var(--signal) 55%, var(--hairline))"
                  : "var(--hairline)",
              }}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-medium text-ink">{tier.name}</h2>
                {tier.highlight ? (
                  <span className="rounded-full bg-signal px-2 py-0.5 text-[0.625rem] font-medium text-[#1b1206]">
                    Most popular
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="font-display text-4xl font-light text-ink">{tier.price}</span>
                <span className="text-sm text-ink-faint">{tier.cadence}</span>
              </div>
              <p className="mt-2 text-sm text-ink-muted">{tier.blurb}</p>

              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-[0.9rem] text-ink-muted">
                    <span className="text-signal-ink">
                      <Check />
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7">
                {tier.plan ? (
                  <a
                    href={`/api/checkout?plan=${tier.plan}`}
                    className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-canvas transition-opacity hover:opacity-90"
                  >
                    Subscribe to {tier.name}
                  </a>
                ) : (
                  <a
                    href="/setup"
                    className="inline-flex w-full items-center justify-center rounded-full border border-hairline px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink/25"
                  >
                    Get started free
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-ink-faint">
          Secure checkout by Stripe. Cancel anytime. Prices in USD.
        </p>
      </main>
      <Footer />
    </>
  );
}

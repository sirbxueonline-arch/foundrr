import { Reveal } from "@/components/Reveal";
import { MeshWhisper } from "@/components/Ambient";
import type { ReactNode } from "react";

// Thin 1px line icons, Aqua-light. Hairline stroke, no fill, generous canvas.
const STROKE = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function AgentsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden {...STROKE}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M7 9l3 2.5L7 14M13 14h4M8 21h8" />
    </svg>
  );
}

function ServersIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden {...STROKE}>
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path d="M7 7h.01M7 17h.01" />
    </svg>
  );
}

function LeashIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden {...STROKE}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </svg>
  );
}

interface Feature {
  readonly icon: ReactNode;
  readonly label: string;
  readonly body: string;
}

const FEATURES: ReadonlyArray<Feature> = [
  {
    icon: <AgentsIcon />,
    label: "Live agents",
    body: "See every Claude Code session as it runs — files touched, commands fired, tokens spent.",
  },
  {
    icon: <ServersIcon />,
    label: "Dev servers",
    body: "Every listening port on your machine, surfaced and reachable with one tap.",
  },
  {
    icon: <LeashIcon />,
    label: "The leash",
    body: "Approve and drive your agents from your pocket. The permission prompt comes to you.",
  },
];

/**
 * Light feature triple — built to Aqua's exact restraint. Three bare columns
 * separated by whitespace only: a thin 1px line icon, a small label, and one
 * muted line each. No card grid, no borders, no shadows — the negative space
 * does the separating. This is the bottom of Aqua's claim/comparison block,
 * carried here as its own airy band.
 */
export function Features() {
  return (
    <section
      id="features"
      className="relative overflow-hidden border-t border-hairline bg-canvas"
    >
      <MeshWhisper />
      <div className="relative mx-auto max-w-5xl px-5 py-20 sm:py-28">
        <div className="grid gap-x-10 gap-y-12 sm:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <Reveal
              key={feature.label}
              delay={i * 0.08}
              className="group flex flex-col"
            >
              <span className="text-ink transition-transform duration-300 motion-safe:group-hover:-translate-y-0.5">
                {feature.icon}
              </span>
              <h3 className="mt-5 text-base font-semibold text-ink">
                {feature.label}
              </h3>
              <p className="mt-2 max-w-xs text-[0.9rem] leading-relaxed text-ink-muted">
                {feature.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

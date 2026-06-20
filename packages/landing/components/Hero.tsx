"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AuroraField } from "@/components/Ambient";

function ArrowRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="transition-transform group-hover:translate-x-0.5"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

/**
 * Hero — light off-white canvas, modeled on Aqua's real hero. Headline-first
 * and left-aligned: an oversized, thin two-line headline carries the whole
 * section with no eyebrow above it (Aqua leads with the line itself). A short
 * muted subline + one quiet secondary link sit beneath. The ambient blob field
 * is the soft white-cloud texture behind. Aqua closes its hero with a single
 * quiet centered scroll dash — kept here. No amber: the headline is the look.
 */
export function Hero() {
  const reduce = useReducedMotion();

  const lineUp = (delay: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const, delay },
  });

  // Per-line mask reveal for the headline: each line rises out of an
  // overflow-clip mask. Under reduced motion the rise is frozen (line is
  // shown in place) by the CSS reduced-motion block.
  const lineDelay = (delay: number) =>
    reduce ? undefined : ({ animationDelay: `${delay}s` } as const);

  return (
    <section
      id="top"
      className="relative overflow-hidden bg-canvas"
    >
      {/* Aurora / mesh field + grain + vignette — Aqua's soft cloud texture. */}
      <AuroraField />

      <div className="relative mx-auto max-w-5xl px-5 pt-32 pb-20 sm:pt-44 sm:pb-28">
        {/* Headline first — left-aligned and oversized, exactly Aqua's hero. */}
        <h1 className="max-w-3xl font-display text-[2.75rem] font-light leading-[1.04] tracking-[-0.025em] text-ink sm:text-[5rem] sm:leading-[0.98]">
          <span className="line-mask">
            <span className="line-rise font-light" style={lineDelay(0.12)}>
              You left the desk.
            </span>
          </span>
          <span className="line-mask">
            <span className="line-rise font-light" style={lineDelay(0.24)}>
              Your agents kept working.
            </span>
          </span>
        </h1>

        <motion.p
          {...lineUp(0.42)}
          className="mt-9 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg"
        >
          Founder is a local command center for your terminal agents. Watch every
          session live, and approve what they ask — from anywhere.
        </motion.p>

        <motion.div {...lineUp(0.52)} className="mt-8">
          <a
            href="#how-it-works"
            className="group inline-flex items-center gap-2 text-sm font-medium text-ink underline-offset-4 hover:underline"
          >
            See how it works
            <ArrowRight />
          </a>
        </motion.div>

        {/* Aqua's quiet scroll cue: a single centered dash that bobs. */}
        <div className="mt-24 flex justify-center sm:mt-32" aria-hidden>
          <span className="scroll-cue text-ink-faint">
            <svg
              width="22"
              height="10"
              viewBox="0 0 22 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            >
              <path d="M2 3l9 4 9-4" />
            </svg>
          </span>
        </div>
      </div>
    </section>
  );
}

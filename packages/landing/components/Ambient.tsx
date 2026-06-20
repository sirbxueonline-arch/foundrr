"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Ambient — reusable, GPU-friendly background layers shared across the home
 * page. Everything here is purely decorative (aria-hidden), sits *behind*
 * content, and is built from CSS gradients / SVG noise only (no images, no
 * canvas). Motion is gated on prefers-reduced-motion: the layers stay visible
 * as static, low-contrast textures, only their drift/parallax is removed.
 */

const PARALLAX_DAMPEN = 0.06;

/**
 * useParallax — translates a node a few pixels as the section scrolls past the
 * viewport centre. Transform-only, rAF-throttled, and a no-op under reduced
 * motion. Returns a ref to attach to the element you want to nudge.
 */
export function useParallax(strength = 1) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || reduce) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const viewportCenter = window.innerHeight / 2;
      const elementCenter = rect.top + rect.height / 2;
      const offset = (elementCenter - viewportCenter) * PARALLAX_DAMPEN * strength;
      node.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduce, strength]);

  return ref;
}

/**
 * AuroraField — the hero centerpiece. A living mesh/aurora gradient: several
 * large blurred radial blobs that continuously drift, scale and cross-fade on
 * offset loops, layered over a slow animated gradient sweep so the field is
 * clearly, calmly in motion. Cool greys + the faintest amber, on the light
 * canvas. The `hero-aurora` scope carries the stronger hero-only motion so the
 * shared `.blob` classes stay subtle on /setup. Plus a grain overlay, a soft
 * vignette, and a gentle scroll parallax for depth. All motion freezes under
 * prefers-reduced-motion (the gradients remain visible, just still).
 */
export function AuroraField() {
  const parallax = useParallax(1);

  return (
    <div className="blob-field hero-aurora" aria-hidden>
      {/* Slow continuous gradient sweep behind the blobs. */}
      <span className="hero-mesh-sweep" />
      <div ref={parallax} className="absolute inset-0">
        <span className="blob blob-a" />
        <span className="blob blob-b" />
        <span className="blob blob-c" />
        <span className="blob blob-d" />
      </div>
      <span className="grain-overlay grain-light" />
      <span className="vignette-light" />
    </div>
  );
}

interface GridFieldProps {
  /** "dots" for a radial dot-grid, "lines" for a hairline grid. */
  readonly variant?: "dots" | "lines";
}

/** GridField — a faint dot-grid or hairline grid that fades out radially. */
export function GridField({ variant = "dots" }: GridFieldProps) {
  return (
    <span
      className={`grid-field ${variant === "dots" ? "grid-dots" : "grid-lines"}`}
      aria-hidden
    />
  );
}

interface RadialBloomProps {
  /** Tailwind position/size classes for placement (absolute positioning). */
  readonly className?: string;
}

/** RadialBloom — a slow-breathing amber glow placed behind a focal element. */
export function RadialBloom({ className = "" }: RadialBloomProps) {
  return <span className={`radial-bloom ${className}`} aria-hidden />;
}

/** NoiseOverlay — standalone grain layer for dark sections. */
export function NoiseOverlay({ tone = "dark" }: { tone?: "light" | "dark" }) {
  return (
    <span
      className={`grain-overlay ${tone === "dark" ? "grain-dark" : "grain-light"}`}
      aria-hidden
    />
  );
}

/** MeshWhisper — a barely-there two-corner mesh tint for light sections. */
export function MeshWhisper() {
  return <span className="mesh-whisper" aria-hidden />;
}

/** Vignette — top/bottom depth gradient for dark sections. */
export function DarkVignette() {
  return <span className="vignette-dark" aria-hidden />;
}

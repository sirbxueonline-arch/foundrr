"use client";

import { useEffect, useState } from "react";

/** A single anchor in the "On this page" contents rail. */
export interface TocItem {
  readonly id: string;
  readonly label: string;
  readonly step?: string;
}

interface OnThisPageProps {
  readonly items: readonly TocItem[];
}

const OBSERVER_OPTIONS: IntersectionObserverInit = {
  // Trigger when a section's heading reaches the upper third of the viewport.
  rootMargin: "-20% 0px -70% 0px",
  threshold: 0,
};

/**
 * Sticky "On this page" rail with active-section highlighting (Mintlify /
 * OpenAI-docs pattern). Uses IntersectionObserver to track which section is in
 * view. Purely presentational/navigational — no data wiring. Degrades to plain
 * anchor links if IntersectionObserver is unavailable.
 */
export function OnThisPage({ items }: OnThisPageProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      const first = visible[0];
      if (first?.target.id) {
        setActiveId(first.target.id);
      }
    }, OBSERVER_OPTIONS);

    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-3 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-faint">
        On this page
      </p>
      <ul className="space-y-0.5 border-l border-line">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? "true" : undefined}
                className={`-ml-px flex items-center gap-2 border-l-2 py-1.5 pl-3.5 transition-colors ${
                  active
                    ? "border-signal text-text"
                    : "border-transparent text-muted hover:border-line hover:text-text"
                }`}
              >
                {item.step ? (
                  <span
                    className={`font-mono text-[0.7rem] ${
                      active ? "text-signal" : "text-faint"
                    }`}
                  >
                    {item.step}
                  </span>
                ) : null}
                <span className="leading-tight">{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

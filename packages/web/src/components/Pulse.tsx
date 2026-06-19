/**
 * Pulse — a small status dot. When `active`, it breathes amber (the one place
 * the UI spends boldness). When inactive, it's a calm static muted dot.
 * Reduced motion is handled in CSS: `.pulse-dot` becomes a steady glow.
 */

interface PulseProps {
  active: boolean;
  /** Optional accessible label; defaults to a sensible status string. */
  label?: string;
}

export function Pulse({ active, label }: PulseProps) {
  const aria = label ?? (active ? "Active" : "Idle");
  const base = "inline-block h-2.5 w-2.5 rounded-full";
  return (
    <span
      role="img"
      aria-label={aria}
      data-active={active}
      className={active ? `${base} pulse-dot` : base}
      style={{
        backgroundColor: active ? "var(--color-signal)" : "var(--color-faint)",
      }}
    />
  );
}

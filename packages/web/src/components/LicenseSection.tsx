/**
 * LicenseSection — the Settings → License panel. Shows the current plan and,
 * for an unlicensed install, an input to paste a Foundrr key (delivered on the
 * landing /welcome page after checkout). Activating POSTs the key to the daemon,
 * which verifies it against the authority and returns the resolved entitlement.
 *
 * Self-contained (its own fetch + state) and styled to match SettingsPage's
 * Section/Row look so it drops in as one more titled card.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { Entitlement, LicensePlan } from "@mission-control/shared";

import { ApiError, getLicense, openBillingPortal, removeLicense, saveLicense } from "../lib/api";
import { useEntitlement } from "../lib/useEntitlement";

const PRICING_URL = "https://foundrr.online/pricing";

const PLAN_LABEL: Record<LicensePlan, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  team: "Team",
};

/** Accent for the plan badge: paid tiers pop, free is muted. */
function planColor(plan: LicensePlan): string {
  if (plan === "pro" || plan === "team") return "var(--color-signal-ink)";
  if (plan === "starter") return "var(--color-cool)";
  return "var(--color-faint)";
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 border-t px-4 py-3.5 first:border-t-0"
      style={{ borderTopColor: "var(--color-line)" }}
    >
      <div className="min-w-0">
        <p className="text-sm" style={{ color: "var(--color-text)" }}>
          {label}
        </p>
        <p className="mt-0.5 text-[0.78rem] leading-snug" style={{ color: "var(--color-muted)" }}>
          {description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function PlanBadge({ plan }: { plan: LicensePlan }) {
  return (
    <span
      className="mono rounded-full px-2 py-0.5 text-[0.625rem] uppercase"
      style={{
        color: planColor(plan),
        border: `1px solid color-mix(in srgb, ${planColor(plan)} 45%, transparent)`,
      }}
    >
      {PLAN_LABEL[plan]}
    </span>
  );
}

export function LicenseSection() {
  const { refresh } = useEntitlement();
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLicense()
      .then((e) => {
        if (!cancelled) setEnt(e);
      })
      .catch(() => {
        // Route may not exist on an older daemon — treat as unknown, render nothing.
        if (!cancelled) setEnt(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activate = async (): Promise<void> => {
    const trimmed = key.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const e = await saveLicense(trimmed);
      setEnt(e);
      setKey("");
      // Propagate to the rest of the app (Overview unlocks, badges update) live.
      void refresh();
      if (!e.active) {
        setError(
          e.status === "not_found"
            ? "Key not found. Check it and try again."
            : `Key is ${e.status}.`,
        );
      }
    } catch (e) {
      setError(e instanceof ApiError ? `Couldn't verify (${e.status}).` : "Couldn't verify.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const e = await removeLicense();
      setEnt(e);
      void refresh();
    } catch (e) {
      setError(e instanceof ApiError ? `Failed (${e.status}).` : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  const manage = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await openBillingPortal();
      // Stripe-hosted portal: cancel, switch plan, update card, invoices.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(
        e instanceof ApiError ? `Couldn't open billing (${e.status}).` : "Couldn't open billing.",
      );
    } finally {
      setBusy(false);
    }
  };

  // Unknown daemon state (older build / fetch error) — render nothing.
  if (!ent) return null;

  const licensed = ent.hasKey && ent.active;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-1 text-[0.8125rem] font-medium" style={{ color: "var(--color-muted)" }}>
        License
      </h3>
      <div className="panel flex flex-col overflow-hidden p-0">
        <Row
          label="Plan"
          description={
            licensed
              ? ent.stale
                ? "Active — offline, using your cached plan."
                : "Active. Thanks for supporting Foundrr."
              : "Unlock the managed leash, Guard, and fleet benchmarks."
          }
        >
          <span className="flex items-center gap-2">
            <PlanBadge plan={ent.plan} />
            {!licensed ? (
              <a
                href={PRICING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="pill pill-cool"
              >
                UPGRADE
              </a>
            ) : null}
          </span>
        </Row>

        {licensed ? (
          <Row
            label="Subscription"
            description={
              ent.periodEnd
                ? `Renews ${new Date(ent.periodEnd).toLocaleDateString()}. Manage opens Stripe — cancel or switch anytime.`
                : "Manage billing on Stripe. Remove just unlinks the key from this machine."
            }
          >
            <span className="flex items-center gap-2">
              <code className="mono text-[0.6875rem]" style={{ color: "var(--color-muted)" }}>
                {ent.maskedKey}
              </code>
              <button
                type="button"
                onClick={() => void manage()}
                disabled={busy}
                className="pill pill-cool"
              >
                {busy ? "…" : "MANAGE"}
              </button>
              <button type="button" onClick={() => void remove()} disabled={busy} className="pill">
                REMOVE
              </button>
            </span>
          </Row>
        ) : (
          <Row
            label="Activate"
            description="Paste the key from your welcome page or receipt email."
          >
            <span className="flex items-center gap-2">
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void activate();
                }}
                placeholder="FNDR-XXXX-XXXX-XXXX"
                spellCheck={false}
                autoComplete="off"
                aria-label="License key"
                className="mono w-52 rounded-md px-2.5 py-1.5 text-[0.6875rem] outline-none"
                style={{
                  backgroundColor: "var(--color-inset)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-line)",
                }}
              />
              <button
                type="button"
                onClick={() => void activate()}
                disabled={busy || key.trim().length === 0}
                className="pill pill-cool"
              >
                {busy ? "VERIFYING…" : "ACTIVATE"}
              </button>
            </span>
          </Row>
        )}

        {error ? (
          <div className="border-t px-4 py-2.5" style={{ borderTopColor: "var(--color-line)" }}>
            <p className="mono text-[0.6875rem]" role="alert" style={{ color: "var(--color-alert)" }}>
              {error}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

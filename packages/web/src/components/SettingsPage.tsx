/**
 * SettingsPage — a Cursor-style settings surface: a centered column of titled
 * sections, each a hairline-bordered card whose rows pair a label + muted
 * description on the left with a control on the right. Consolidates the
 * dashboard's preferences (model, appearance, remote access, spend, telemetry)
 * into one calm, scannable place.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { CostSnapshot } from "@mission-control/shared";
import {
  ApiError,
  exportCostCsv,
  getConfig,
  getTelegramStatus,
  type DaemonConfig,
  type LaunchableAgent,
  type TelegramStatus,
} from "../lib/api";
import type { StreamStatus } from "../lib/useStream";
import { usd, compactTokens } from "../lib/format";
import { ModelPicker } from "./ModelPicker";
import { BudgetMeter } from "./BudgetMeter";
import { applyTheme, readTheme } from "./ThemeToggle";
import { resetOnboarding } from "./Onboarding";

interface SettingsPageProps {
  model: string | null;
  agents: LaunchableAgent[] | null;
  onModelChange: (model: string) => void;
  cost: CostSnapshot | null;
  status: StreamStatus;
  host: string;
  onOpenAccess: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-1 text-[0.8125rem] font-medium" style={{ color: "var(--color-muted)" }}>
        {title}
      </h3>
      <div className="panel flex flex-col overflow-hidden p-0">{children}</div>
    </section>
  );
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

type Theme = "light" | "dark";

/** A Cursor-style segmented Light / Dark switch. */
function ThemeControl() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const choose = (t: Theme): void => {
    setTheme(t);
    applyTheme(t);
  };
  return (
    <div
      className="inline-flex rounded-lg p-0.5"
      style={{ backgroundColor: "var(--color-inset)", border: "1px solid var(--color-line)" }}
      role="group"
      aria-label="Appearance"
    >
      {(["light", "dark"] as const).map((t) => {
        const active = theme === t;
        return (
          <button
            key={t}
            type="button"
            aria-pressed={active}
            onClick={() => choose(t)}
            className="rounded-md px-3 py-1 text-xs capitalize transition-colors"
            style={{
              backgroundColor: active ? "var(--color-panel)" : "transparent",
              color: active ? "var(--color-text)" : "var(--color-muted)",
              boxShadow: active
                ? "0 1px 2px color-mix(in srgb, var(--color-text) 14%, transparent)"
                : "none",
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

function ExportButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onExport = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await exportCostCsv();
    } catch (e) {
      setError(e instanceof ApiError ? `failed (${e.status})` : "failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      {error ? (
        <span className="mono text-[0.625rem]" role="alert" style={{ color: "var(--color-alert)" }}>
          {error}
        </span>
      ) : null}
      <button type="button" onClick={() => void onExport()} disabled={busy} className="pill pill-cool">
        {busy ? "EXPORTING…" : "EXPORT CSV"}
      </button>
    </span>
  );
}

const CONN_LABEL: Record<StreamStatus, string> = {
  open: "Connected",
  connecting: "Connecting",
  reconnecting: "Reconnecting",
};
const CONN_COLOR: Record<StreamStatus, string> = {
  open: "var(--color-ok)",
  connecting: "var(--color-cool)",
  reconnecting: "var(--color-signal-ink)",
};

export function SettingsPage({
  model,
  agents,
  onModelChange,
  cost,
  status,
  host,
  onOpenAccess,
}: SettingsPageProps) {
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
  const [cfg, setCfg] = useState<DaemonConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getTelegramStatus().then((s) => {
      if (!cancelled) setTelegram(s);
    });
    getConfig()
      .then((c) => {
        if (!cancelled) setCfg(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const telegramLinked = telegram?.linked === true;
  const shareOn = cfg?.telemetryShare === true;

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-7 overflow-y-auto px-1 py-2">
      <header className="px-1">
        <h2 className="text-lg font-medium" style={{ color: "var(--color-text)" }}>
          Settings
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
          Preferences for this dashboard and the agents it supervises.
        </p>
      </header>

      <Section title="General">
        <Row label="AI model" description="The agent your terminal launches and your leaderboard bucket.">
          <div className="w-44">
            <ModelPicker model={model} agents={agents} onModelChange={onModelChange} />
          </div>
        </Row>
        <Row label="Appearance" description="Light or dark dashboard. The terminal stays dark.">
          <ThemeControl />
        </Row>
      </Section>

      <Section title="Remote access">
        <Row
          label="Access from anywhere"
          description="Open the dashboard on your phone via QR, LAN, or a public tunnel."
        >
          <button type="button" onClick={onOpenAccess} className="pill pill-cool">
            OPEN
          </button>
        </Row>
        <Row
          label="Telegram leash"
          description="Approve agent permission prompts from your phone — one tap, from anywhere."
        >
          <span className="flex items-center gap-2">
            <span
              className="mono text-[0.6875rem]"
              style={{ color: telegramLinked ? "var(--color-ok)" : "var(--color-faint)" }}
            >
              {telegramLinked ? "Linked" : "Not linked"}
            </span>
            <button type="button" onClick={onOpenAccess} className="pill">
              {telegramLinked ? "MANAGE" : "SET UP"}
            </button>
          </span>
        </Row>
      </Section>

      <Section title="Spend">
        <Row
          label="Daily budget"
          description="A local guardrail — turns amber near the cap, red once you're over."
        >
          <div className="w-44">
            <BudgetMeter todayUsd={cost?.todayUsd ?? 0} />
          </div>
        </Row>
        <Row
          label="Usage"
          description={
            cost
              ? `${usd(cost.todayUsd)} today · ${usd(cost.lifetimeUsd)} all-time · ${compactTokens(cost.lifetimeTokens)} tokens`
              : "Telemetry isn't reporting yet."
          }
        >
          {cost ? (
            <ExportButton />
          ) : (
            <span className="mono text-[0.6875rem]" style={{ color: "var(--color-faint)" }}>
              off
            </span>
          )}
        </Row>
      </Section>

      <Section title="Telemetry">
        <Row
          label="Anonymous usage sharing"
          description="Install id + model + token/cost deltas power the public leaderboard. Never code, paths, or prompts."
        >
          <span
            className="mono rounded-full px-2 py-0.5 text-[0.625rem]"
            style={{
              color: shareOn ? "var(--color-ok)" : "var(--color-faint)",
              border: `1px solid ${shareOn ? "color-mix(in srgb, var(--color-ok) 45%, transparent)" : "var(--color-line)"}`,
            }}
          >
            {cfg ? (shareOn ? "ON" : "OFF") : "…"}
          </span>
        </Row>
        <Row label="Change sharing" description="Toggle anonymous sharing from the CLI, then restart the daemon.">
          <code
            className="mono rounded px-2 py-1 text-[0.6875rem]"
            style={{
              backgroundColor: "var(--color-inset)",
              color: "var(--color-text)",
              border: "1px solid var(--color-line)",
            }}
          >
            mc telemetry share {shareOn ? "off" : "on"}
          </code>
        </Row>
      </Section>

      <Section title="Connection">
        <Row label="Daemon" description={host || "this machine"}>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: CONN_COLOR[status] }}
              aria-hidden
            />
            <span className="mono text-[0.6875rem]" style={{ color: CONN_COLOR[status] }} role="status">
              {CONN_LABEL[status]}
            </span>
          </span>
        </Row>
        <Row label="Product tour" description="Replay the first-run walkthrough of the dashboard.">
          <button
            type="button"
            onClick={() => {
              resetOnboarding();
              window.location.reload();
            }}
            className="pill"
          >
            REPLAY
          </button>
        </Row>
      </Section>
    </div>
  );
}

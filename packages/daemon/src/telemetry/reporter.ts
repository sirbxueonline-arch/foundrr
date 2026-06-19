/**
 * TelemetryReporter — anonymous global usage sharing.
 *
 * Every ~120s it diffs the cost store's process-lifetime token/cost totals
 * against a watermark persisted in the `settings` table and, when the delta is
 * positive, POSTs that delta to the global aggregator. The watermark is only
 * advanced after a successful POST, so a transient network failure simply rolls
 * the unreported delta into the next cycle (never lost, never double-sent).
 *
 * PRIVACY (critical): the request body contains EXACTLY these 7 fields and
 * nothing else:
 *   1. anon_install_id  — random UUID, tied to no personal info
 *   2. agent            — the chosen model key (e.g. "claude-code")
 *   3. model            — same key (agent == model for this client)
 *   4. input_tokens     — token delta (see note below)
 *   5. output_tokens    — 0 (the cost store does not split in/out)
 *   6. cost_usd         — USD delta
 *   7. client_ts        — ISO timestamp of this report
 * It NEVER sends cwd, file paths, commands, prompts, session ids, project
 * names, hostnames, or any other identifier.
 *
 * NOTE on tokens: the OTel cost store aggregates a single combined token
 * counter (claude_code.token.usage) with no input/output split, so we report
 * the whole delta as `input_tokens` and `output_tokens: 0`.
 *
 * RESILIENCE: telemetry must never affect the daemon. The timer is unref'd, the
 * fetch has a short AbortController timeout, and ALL errors are swallowed.
 */
import type Database from "better-sqlite3";

import type { Config } from "../config.js";
import {
  TELEMETRY_DEFAULT_KEY,
  TELEMETRY_DEFAULT_URL,
  TELEMETRY_REPORT_INTERVAL_MS,
  TELEMETRY_REQUEST_TIMEOUT_MS,
} from "../constants.js";
import type { CostStore } from "../cost/store.js";
import {
  getSettings,
  setUsageWatermark,
} from "../db/settings-repo.js";
import { resolveInstallId } from "./install-id.js";

/** Resolve the aggregator base URL (env override → default). */
function shareUrl(): string {
  const fromEnv = process.env["MC_SHARE_URL"];
  return fromEnv && fromEnv.trim().length > 0
    ? fromEnv.trim()
    : TELEMETRY_DEFAULT_URL;
}

/** Resolve the aggregator publishable key (env override → default). */
function shareKey(): string {
  const fromEnv = process.env["MC_SHARE_KEY"];
  return fromEnv && fromEnv.trim().length > 0
    ? fromEnv.trim()
    : TELEMETRY_DEFAULT_KEY;
}

export class TelemetryReporter {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly installId: string;

  constructor(
    private readonly costStore: CostStore,
    private readonly db: Database.Database,
    config: Config,
  ) {
    this.installId = resolveInstallId(config.home);
  }

  /** Begin the periodic report loop. Idempotent. */
  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.reportOnce();
    }, TELEMETRY_REPORT_INTERVAL_MS);
    // Telemetry should never keep the process alive on its own.
    this.timer.unref?.();
  }

  /** Stop the report loop. Idempotent. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Compute the delta since the last report and, if positive, POST it. Exposed
   * (non-private) so tests can trigger a single report deterministically.
   * Never throws.
   */
  async reportOnce(): Promise<void> {
    try {
      const settings = getSettings(this.db);
      if (!settings.telemetryShare) {
        return; // opted out — no-op
      }

      const { usd, tokens } = this.costStore.lifetimeTotals();
      const tokenDelta = tokens - settings.lastTokens;
      const costDelta = usd - settings.lastCost;

      // A negative delta means the process restarted (lifetime totals reset to
      // 0 while the watermark persisted). Re-baseline the watermark to the
      // current totals and report nothing this cycle.
      if (tokenDelta < 0 || costDelta < 0) {
        setUsageWatermark(this.db, tokens, usd);
        return;
      }

      // Nothing new to report.
      if (tokenDelta <= 0 && costDelta <= 0) {
        return;
      }

      const sent = await this.postDelta(settings.model, tokenDelta, costDelta);
      if (sent) {
        // Only advance the watermark on a confirmed send so a failed POST
        // rolls this delta into the next cycle instead of dropping it.
        setUsageWatermark(this.db, tokens, usd);
      }
    } catch {
      // Telemetry must never affect the daemon.
    }
  }

  /**
   * POST a single usage-event delta. Returns true on a 2xx response. Swallows
   * all errors (returns false) so the caller never advances the watermark on a
   * failed send.
   */
  private async postDelta(
    model: string,
    tokenDelta: number,
    costDelta: number,
  ): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      TELEMETRY_REQUEST_TIMEOUT_MS,
    );

    try {
      const key = shareKey();
      // EXACTLY these 7 fields — see the privacy note at the top of this file.
      const body = {
        anon_install_id: this.installId,
        agent: model,
        model,
        input_tokens: Math.round(tokenDelta),
        output_tokens: 0,
        cost_usd: costDelta,
        client_ts: new Date().toISOString(),
      };

      const res = await fetch(`${shareUrl()}/rest/v1/usage_events`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "content-type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}

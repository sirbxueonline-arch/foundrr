/**
 * LicenseService — the daemon's Pro/Team entitlement brain.
 *
 * Lifecycle: on start() it verifies the stored key once (non-blocking) and then
 * re-verifies daily. Each verify POSTs the key to the landing app's
 * `/api/license/verify` and caches the verdict in the `license` table.
 *
 * RESILIENCE: a verify failure (offline, authority down) NEVER downgrades a
 * paying user immediately — the cached verdict keeps the plan alive for
 * LICENSE_GRACE_MS past the last SUCCESSFUL verify. Only a confirmed inactive
 * status, or grace expiring, drops the install back to "free". Every network
 * path swallows its error; licensing must never crash or block the daemon.
 *
 * Defense note: this client-side gate is for UX + local feature flags. The real
 * moat is server-side — Pro cloud services (managed relay, Guard rules) check
 * the license at their own boundary, so deleting this check in an OSS fork can't
 * unlock them.
 */
import type Database from "better-sqlite3";

import type { Entitlement, LicensePlan } from "@mission-control/shared";

import {
  LICENSE_DEFAULT_URL,
  LICENSE_GRACE_MS,
  LICENSE_REQUEST_TIMEOUT_MS,
  LICENSE_VERIFY_INTERVAL_MS,
  LICENSE_VERIFY_PATH,
} from "../constants.js";
import {
  clearLicense,
  getLicense,
  recordVerification,
  recordVerifyFailure,
  setLicenseKey,
  type LicenseRow,
} from "../db/license-repo.js";

const PLANS: ReadonlySet<LicensePlan> = new Set<LicensePlan>([
  "free",
  "starter",
  "pro",
  "team",
]);

/** Narrow an untrusted plan string to a known LicensePlan, defaulting to free. */
function coercePlan(value: string | null | undefined): LicensePlan {
  return value && PLANS.has(value as LicensePlan) ? (value as LicensePlan) : "free";
}

/** Resolve the license authority base URL (env override → default). */
function licenseBase(): string {
  return (process.env["FOUNDRR_LICENSE_URL"] ?? LICENSE_DEFAULT_URL).replace(/\/+$/, "");
}

/** Resolve the verify endpoint (env override → default). */
function verifyUrl(): string {
  return `${licenseBase()}${LICENSE_VERIFY_PATH}`;
}

/** Show the head + last 4 of a key so the user can recognize it without leaking it. */
function maskKey(key: string): string {
  const tail = key.slice(-4);
  return `FNDR-••••-${tail}`;
}

/** Shape the verify endpoint returns (all fields defensive / optional). */
interface VerifyResponse {
  valid?: boolean;
  plan?: string;
  status?: string;
  seats?: number;
  periodEnd?: string | null;
}

/**
 * Pure resolver: turn the cached row into the effective entitlement, applying
 * the offline grace window. Exported for direct testing without a service.
 */
export function resolveEntitlement(row: LicenseRow, now: number): Entitlement {
  if (!row.licenseKey) {
    return {
      plan: "free",
      active: false,
      status: "none",
      seats: 0,
      periodEnd: null,
      hasKey: false,
      maskedKey: null,
      lastVerifiedAt: 0,
      stale: false,
    };
  }

  const withinGrace =
    row.lastVerifiedAt > 0 && now - row.lastVerifiedAt <= LICENSE_GRACE_MS;
  const effectiveActive = row.active && withinGrace;
  const plan: LicensePlan = effectiveActive ? coercePlan(row.plan) : "free";
  const overdue =
    row.lastVerifiedAt === 0 || now - row.lastVerifiedAt > LICENSE_VERIFY_INTERVAL_MS;

  return {
    plan,
    active: effectiveActive,
    status: row.status ?? (row.lastVerifiedAt === 0 ? "pending" : "unknown"),
    seats: row.seats,
    periodEnd: row.periodEnd,
    hasKey: true,
    maskedKey: maskKey(row.licenseKey),
    lastVerifiedAt: row.lastVerifiedAt,
    stale: !!row.lastError || overdue,
  };
}

export class LicenseService {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly db: Database.Database) {}

  /** Verify once at launch (non-blocking), then re-verify daily. */
  start(): void {
    void this.verifyNow();
    this.timer = setInterval(() => {
      void this.verifyNow();
    }, LICENSE_VERIFY_INTERVAL_MS);
    // Don't keep the event loop alive solely for the verify timer.
    this.timer.unref?.();
  }

  /** Stop the daily re-verify timer. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** The current effective entitlement (cached row + grace resolution). */
  entitlement(now: number = Date.now()): Entitlement {
    return resolveEntitlement(getLicense(this.db), now);
  }

  /**
   * Store a key (normalized) and verify it right away, returning the resolved
   * entitlement so the dashboard can reflect the verdict immediately.
   */
  async setKey(key: string): Promise<Entitlement> {
    setLicenseKey(this.db, key.trim().toUpperCase());
    await this.verifyNow();
    return this.entitlement();
  }

  /** Remove the key; the install reverts to the free baseline. */
  clear(): Entitlement {
    clearLicense(this.db);
    return this.entitlement();
  }

  /**
   * Open a Stripe Customer Portal session for the stored key and return its URL,
   * so the user can cancel / change / update billing. The full key stays on the
   * daemon — only the resulting one-time portal URL is handed to the dashboard.
   * Returns null when there's no key or the authority is unreachable.
   */
  async billingPortalUrl(): Promise<string | null> {
    const row = getLicense(this.db);
    if (!row.licenseKey) {
      return null;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LICENSE_REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${licenseBase()}/api/billing/portal`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ key: row.licenseKey }),
        signal: controller.signal,
      });
      if (!res.ok) {
        return null;
      }
      const data = (await res.json()) as { url?: unknown };
      return typeof data.url === "string" ? data.url : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Verify the stored key against the authority and persist the verdict. A
   * network failure is recorded as a soft error (grace keeps the plan alive);
   * a successful response — even valid:false — replaces the cached verdict.
   */
  async verifyNow(): Promise<void> {
    const row = getLicense(this.db);
    if (!row.licenseKey) {
      return;
    }
    try {
      const res = await this.fetchVerify(row.licenseKey);
      recordVerification(
        this.db,
        {
          plan: coercePlan(res.plan),
          status: typeof res.status === "string" ? res.status : "unknown",
          seats: typeof res.seats === "number" ? res.seats : 0,
          periodEnd: typeof res.periodEnd === "string" ? res.periodEnd : null,
          active: res.valid === true,
        },
        Date.now(),
      );
    } catch (err) {
      recordVerifyFailure(
        this.db,
        err instanceof Error ? err.message : "verify failed",
      );
    }
  }

  /** POST the key to the verify endpoint with a hard timeout. */
  private async fetchVerify(key: string): Promise<VerifyResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LICENSE_REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(verifyUrl(), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ key }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`verify ${res.status}`);
      }
      return (await res.json()) as VerifyResponse;
    } finally {
      clearTimeout(timer);
    }
  }
}

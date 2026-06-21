/**
 * License records live in the `licenses` table of the Foundrr telemetry Supabase
 * (RLS on, no public policies) and are only ever touched server-side with the
 * service-role key. We use raw PostgREST (same pattern as lib/supabase.ts) so we
 * don't pull in the Supabase SDK.
 */
import type Stripe from "stripe";

import { PRICE_IDS } from "./stripe";

export type Plan = "starter" | "pro" | "team";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://hmnviltczxxxpzunpnlb.supabase.co";

function serviceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — add it to the Vercel project env.");
  }
  return key;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = serviceKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

const PRICE_TO_PLAN: Record<string, Plan> = {
  [PRICE_IDS.starter]: "starter",
  [PRICE_IDS.pro]: "pro",
  [PRICE_IDS.team]: "team",
};

/** Map a Stripe price id back to our plan key (defaults to starter). */
export function planForPrice(priceId: string | null | undefined): Plan {
  return (priceId && PRICE_TO_PLAN[priceId]) || "starter";
}

/** A human-typeable key like FNDR-AB12-CD34-EF56-GH78 (Crockford base32). */
export function generateLicenseKey(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // no I L O U
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += alphabet.charAt((bytes[i] ?? 0) % 32);
    if (i % 4 === 3 && i < bytes.length - 1) out += "-";
  }
  return `FNDR-${out}`;
}

export interface LicenseRecord {
  license_key: string;
  plan: Plan;
  status: string;
  seats: number;
  current_period_end: string | null;
}

const SELECT = "license_key,plan,status,seats,current_period_end";

export async function getLicenseBySubscription(
  subscriptionId: string,
): Promise<LicenseRecord | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/licenses?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=${SELECT}`,
    { headers: authHeaders() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as LicenseRecord[];
  return rows[0] ?? null;
}

export async function verifyLicense(key: string): Promise<LicenseRecord | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/licenses?license_key=eq.${encodeURIComponent(key)}&select=${SELECT}`,
    { headers: authHeaders() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as LicenseRecord[];
  return rows[0] ?? null;
}

/**
 * Resolve the Stripe customer id for a license key. Used to open a Customer
 * Portal session so the buyer can cancel / change / update billing themselves.
 * Returns null when the key is unknown or has no customer on file.
 */
export async function getCustomerIdByKey(key: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/licenses?license_key=eq.${encodeURIComponent(key)}&select=stripe_customer_id`,
    { headers: authHeaders() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as { stripe_customer_id: string | null }[];
  return rows[0]?.stripe_customer_id ?? null;
}

export interface UpsertLicenseParams {
  subscriptionId: string;
  customerId: string | null;
  email: string | null;
  plan: Plan;
  status: string;
  seats: number;
  currentPeriodEnd: number | null;
}

/**
 * Insert or update the license for a subscription. Reuses the existing key if
 * the subscription already has one, so a status change (renew/cancel) never
 * rotates the user's key.
 */
export async function upsertLicense(params: UpsertLicenseParams): Promise<string> {
  const existing = await getLicenseBySubscription(params.subscriptionId);
  const key = existing?.license_key ?? generateLicenseKey();
  const row = {
    license_key: key,
    email: params.email,
    stripe_customer_id: params.customerId,
    stripe_subscription_id: params.subscriptionId,
    plan: params.plan,
    status: params.status,
    seats: params.seats,
    current_period_end: params.currentPeriodEnd
      ? new Date(params.currentPeriodEnd * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/licenses?on_conflict=stripe_subscription_id`, {
    method: "POST",
    headers: authHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([row]),
  });
  if (!res.ok) {
    // Surface the failure instead of silently dropping the issuance — the caller
    // (webhook / welcome) logs it, and a wrong/missing service-role key or an RLS
    // block becomes diagnosable rather than an empty `licenses` table.
    const detail = await res.text().catch(() => "");
    throw new Error(`license upsert failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return key;
}

/**
 * Build the license params from a Stripe subscription and upsert. Returns the
 * key. Shared by the webhook (event-driven) AND the /welcome page (self-mint on
 * load), so issuance never depends on the webhook alone — and the page never
 * races it. Idempotent: an existing subscription keeps its key.
 */
export async function upsertLicenseForSubscription(
  sub: Stripe.Subscription,
  email: string | null,
): Promise<string> {
  const item = sub.items.data[0];
  return upsertLicense({
    subscriptionId: sub.id,
    customerId: typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null),
    email,
    plan: planForPrice(item?.price.id),
    status: sub.status,
    seats: item?.quantity ?? 1,
    currentPeriodEnd: item?.current_period_end ?? null,
  });
}

export async function updateLicenseStatus(subscriptionId: string, status: string): Promise<void> {
  await fetch(
    `${SUPABASE_URL}/rest/v1/licenses?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}`,
    {
      method: "PATCH",
      headers: authHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
    },
  );
}

import Stripe from "stripe";

/**
 * Live Stripe price ids (created in the "birclick" account). Overridable via env
 * so you can swap to test-mode prices without a code change. These are price ids,
 * not secrets — safe to ship in the bundle/server.
 */
export const PRICE_IDS = {
  pro: process.env.STRIPE_PRICE_PRO || "price_1TkiqALyS5gAbDs7vvj3NTDC",
  team: process.env.STRIPE_PRICE_TEAM || "price_1TkiqBLyS5gAbDs7J3rU4xJM",
} as const;

export type PlanKey = keyof typeof PRICE_IDS;

/** Absolute site origin used for Checkout success/cancel redirects. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://foundrr.online";

/**
 * Construct the server-side Stripe client. Throws a clear error when the secret
 * key isn't configured, so a missing env var surfaces as a 500 with a useful
 * message rather than a cryptic SDK crash. NEVER expose the secret to the client.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set — add it to the Vercel project env.");
  }
  return new Stripe(key);
}

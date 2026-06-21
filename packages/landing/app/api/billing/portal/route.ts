import { NextResponse, type NextRequest } from "next/server";

import { getStripe, SITE_URL } from "@/lib/stripe";
import { getCustomerIdByKey } from "@/lib/license";

// Stripe needs the Node runtime; never cache a portal session.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/portal   body: { key }
 * Creates a Stripe Customer Portal session for the license's customer and
 * returns its URL. The buyer manages everything there — cancel, switch plan,
 * update card, download invoices — so we never build (or maintain) that UI.
 * The dashboard calls this via the daemon, which holds the full key server-side.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let key: string | undefined;
  try {
    const body = (await req.json()) as { key?: unknown };
    key = typeof body.key === "string" ? body.key.trim().toUpperCase() : undefined;
  } catch {
    key = undefined;
  }
  if (!key) {
    return NextResponse.json({ error: "Missing license key" }, { status: 400 });
  }

  try {
    const customer = await getCustomerIdByKey(key);
    if (!customer) {
      return NextResponse.json(
        { error: "No subscription found for this key" },
        { status: 404 },
      );
    }
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${SITE_URL}/welcome`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Portal session failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

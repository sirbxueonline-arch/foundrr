import { NextResponse, type NextRequest } from "next/server";

import { getStripe, PRICE_IDS, SITE_URL, type PlanKey } from "@/lib/stripe";

// Stripe needs the Node runtime (not edge); never cache a checkout session.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/checkout?plan=pro|team
 * Creates a live Stripe Checkout Session for the chosen subscription price and
 * 303-redirects the browser to Stripe's hosted checkout. Plain GET so a static
 * marketing page can link straight to it with no client JS.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const plan = req.nextUrl.searchParams.get("plan");
  if (plan !== "pro" && plan !== "team") {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: PRICE_IDS[plan as PlanKey], quantity: 1 }],
      success_url: `${SITE_URL}/pricing?status=success`,
      cancel_url: `${SITE_URL}/pricing?status=cancelled`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });

    if (!session.url) {
      return NextResponse.json({ error: "Checkout session has no URL" }, { status: 500 });
    }
    return NextResponse.redirect(session.url, 303);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

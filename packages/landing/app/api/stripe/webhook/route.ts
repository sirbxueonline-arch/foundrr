import { NextResponse, type NextRequest } from "next/server";

import { getStripe } from "@/lib/stripe";

// Signature verification needs the raw body + Node crypto → Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook
 * Verifies the Stripe signature against STRIPE_WEBHOOK_SECRET, then acknowledges
 * the event. This is the hook point where entitlement (grant/revoke Pro) will
 * live once an accounts/license store exists — for now it verifies + logs so the
 * endpoint is real and secure, and nothing is silently trusted.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const body = await req.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // TODO(entitlement): persist Pro/Team access for this customer once the
      // licensing backend exists (the next milestone after payment rails).
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

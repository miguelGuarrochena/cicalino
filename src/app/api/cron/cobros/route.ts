import { NextResponse } from "next/server";
import { sendBillingReminders } from "@/lib/actions/billing";
import { sweepSubscriptions } from "@/lib/actions/subscriptionSweep";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const vercelCron = req.headers.get("x-vercel-cron");
  const okAuth =
    (secret && auth === `Bearer ${secret}`) || Boolean(vercelCron);

  if (!okAuth) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const suscripciones = await sweepSubscriptions();
  const cobros = await sendBillingReminders();
  return NextResponse.json({ ...cobros, suscripciones });
};

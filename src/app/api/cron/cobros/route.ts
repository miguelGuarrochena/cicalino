import { NextResponse } from "next/server";
import { enviarAvisosCobro } from "@/lib/actions/cobros";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/cron/cobros — Vercel Cron diario.
// Auth: Authorization: Bearer CRON_SECRET (o header de Vercel Cron).
export const GET = async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const vercelCron = req.headers.get("x-vercel-cron");
  const okAuth =
    (secret && auth === `Bearer ${secret}`) || Boolean(vercelCron);

  if (!okAuth) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const r = await enviarAvisosCobro();
  return NextResponse.json(r);
};

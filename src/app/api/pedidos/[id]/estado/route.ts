import { NextResponse } from "next/server";

// PATCH /api/pedidos/[id]/estado -> cambia el estado del pedido
// body: { estado: "listo" | "retirado" | "cancelado" }
//
// Al pasar a "listo" dispara el aviso Web Push a las suscripciones del pedido.
// Stub hasta conectar Neon + VAPID.

export const PATCH = async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return NextResponse.json(
    { ok: false, id, mensaje: "No implementado. Conectar Neon primero." },
    { status: 501 },
  );
};

import { NextResponse } from "next/server";

// GET /api/p/[token] -> estado publico del pedido para la vista del cliente.
// Devuelve solo lo minimo (referencia, estado, nombre del local).
// Valida que el token exista y no haya expirado. Stub hasta conectar Neon.

export const GET = async (_req: Request, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  return NextResponse.json(
    { ok: false, token, mensaje: "No implementado. Conectar Neon primero." },
    { status: 501 },
  );
};

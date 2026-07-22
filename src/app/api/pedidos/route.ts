import { NextResponse } from "next/server";

// GET /api/pedidos  -> lista de pedidos del local (del dia)
// POST /api/pedidos -> crea un pedido (genera qrToken + expiracion)
//
// Stub: se implementa cuando conectemos Neon. La logica usara:
//   - db.query.pedidos (lib/db)
//   - generarQrToken() + finDelDiaArgentina() (lib/utils/token)

export const GET = async () => {
  return NextResponse.json(
    { ok: false, mensaje: "No implementado. Conectar Neon primero." },
    { status: 501 },
  );
};

export const POST = async () => {
  return NextResponse.json(
    { ok: false, mensaje: "No implementado. Conectar Neon primero." },
    { status: 501 },
  );
};

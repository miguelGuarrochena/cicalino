import { failure, guardGuestRequest } from "@/lib/server/guestApi";

export const dynamic = "force-dynamic";

/* El cobro del comensal es uno: definir parte + pedir cuenta, o pagar todo.
 * Este POST era el modelo viejo (`pagar_como_comensal`) y dejaba dos caminos
 * de cobro. Se desactiva a propósito: checkout de mercado_pago sigue en
 * /cuenta/pedir, /cuenta/pagar-todo y /pagos/[pagoId]/checkout. */
export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const blocked = await guardGuestRequest(req, token, {
    action: "pago",
    perToken: 40,
    perIp: 40,
    windowMs: 60_000,
    mutating: true,
  });
  if (blocked) return blocked;
  return failure("flujo-cuenta");
};

import "server-only";

/* IP del cliente para limitar por origen.
 *
 * En Vercel el primer valor de x-forwarded-for es el cliente real: el proxy
 * reescribe la cabecera, así que no la puede falsear quien llama. Fuera de
 * Vercel (o detrás de otro proxy) hay que revisar que eso siga siendo cierto
 * antes de confiar en el valor.
 *
 * Devuelve "sin-ip" cuando no hay cabecera, para que la clave del rate limit
 * nunca quede vacía y colapse a todos los clientes en el mismo bucket. */
export const clientIp = (req: Request): string => {
  const fwd = req.headers.get("x-forwarded-for");
  const primera = fwd?.split(",")[0]?.trim();
  if (primera) return primera;
  return req.headers.get("x-real-ip")?.trim() || "sin-ip";
};

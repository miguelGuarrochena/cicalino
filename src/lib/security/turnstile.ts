import "server-only";

// Verificación de Cloudflare Turnstile (anti-bot en el formulario público).
// Si no hay TURNSTILE_SECRET_KEY, no bloquea (útil en dev/demo).
export const verificarTurnstile = async (
  token: string | undefined,
  ip?: string,
): Promise<boolean> => {
  // Nombre canónico del skill (TURNSTILE_SECRET), con fallback al viejo.
  const secret =
    process.env.TURNSTILE_SECRET ?? process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Fail-open SOLO fuera de producción. En prod, si falta la clave el
    // formulario público queda abierto a bots: mejor fallar cerrado.
    if (process.env.NODE_ENV === "production") {
      console.error("turnstile: falta TURNSTILE_SECRET en producción");
      return false;
    }
    return true;
  }
  if (!token) return false;
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret,
          response: token,
          ...(ip ? { remoteip: ip } : {}),
        }),
      },
    );
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
};

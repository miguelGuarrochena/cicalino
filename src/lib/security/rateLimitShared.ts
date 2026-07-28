import "server-only";
import { rateLimit as rateLimitLocal, type RateResult } from "./rateLimit";

// ---------------------------------------------------------------------------
// Rate limiter COMPARTIDO entre instancias, sobre Upstash Redis (REST).
//
// Por qué: el limitador en memoria (rateLimit.ts) vive por instancia. En
// serverless, cada lambda fría arranca con los contadores en cero, así que un
// atacante que rote conexiones consigue muchos más intentos de los que dice el
// límite. Para el login eso importa: es la diferencia entre 8 intentos y 8
// por cada instancia que Vercel levante.
//
// Si no hay Upstash configurado, cae al limitador en memoria: sigue frenando
// el abuso contra cada instancia caliente, que es mejor que nada.
//
// Setup (plan gratis alcanza de sobra):
//   1. upstash.com → crear una base Redis
//   2. En Vercel: UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN
// ---------------------------------------------------------------------------

const URL_BASE = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const rateLimitDistribuido = Boolean(URL_BASE && TOKEN);

type Pipeline = [string, ...string[]][];

const ejecutar = async (comandos: Pipeline): Promise<unknown[] | null> => {
  try {
    const res = await fetch(`${URL_BASE}/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(comandos),
      cache: "no-store",
      // Si Redis tarda, no bloqueamos el login.
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: unknown; error?: string }[];
    return json.map((r) => r.result);
  } catch {
    return null;
  }
};

/**
 * Igual que `rateLimit`, pero el contador es global si hay Upstash.
 *
 * Ventana fija con INCR + EXPIRE: la primera petición de la ventana crea la
 * clave y le pone TTL; el resto solo incrementa.
 *
 * @example await rateLimitCompartido(`login:${email}`, 8, 600_000)
 */
export const rateLimitCompartido = async (
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateResult> => {
  // Siempre aplicamos el límite local: es gratis y corta el abuso más burdo
  // antes de gastar una llamada de red.
  const local = rateLimitLocal(key, limit, windowMs);
  if (!local.ok) return local;
  if (!rateLimitDistribuido) return local;

  const ttl = Math.ceil(windowMs / 1000);
  const clave = `rl:${key}`;
  const r = await ejecutar([
    ["INCR", clave],
    ["EXPIRE", clave, String(ttl), "NX"],
    ["TTL", clave],
  ]);

  // Redis caído o lento: no dejamos afuera a usuarios legítimos, ya cubrimos
  // con el límite local. (Fail-open a propósito, y acotado.)
  if (!r) return local;

  const cuenta = Number(r[0] ?? 0);
  const restante = Number(r[2] ?? ttl);
  if (cuenta > limit) {
    return { ok: false, retryAfter: restante > 0 ? restante : ttl };
  }
  return { ok: true, retryAfter: 0 };
};

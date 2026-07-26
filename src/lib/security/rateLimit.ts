import "server-only";

// Rate limiter en memoria (ventana fija por clave). SIN infra extra ni costo.
//
// Nota sobre serverless: la memoria es POR INSTANCIA. Esto frena el abuso
// contra cada instancia caliente (que es lo que protege a la base detrás), sin
// depender de Redis. Para un límite global duro a nivel plataforma se usa el
// firewall de Vercel (o un store compartido tipo Upstash) — ver notas al equipo.
//
// Elegimos la clave por TOKEN (no por IP): los clientes escanean desde el
// celular y muchos comparten IP (wifi del local, CGNAT de la operadora), así
// que limitar por IP bloquearía usuarios legítimos. Por token, cada pedido solo
// afecta su propia cuota.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

// Cota de memoria: limpiamos entradas vencidas cada minuto, y si el mapa crece
// demasiado (flood de claves nuevas), lo vaciamos por completo.
const MAX_KEYS = 20_000;

const sweep = (now: number) => {
  if (now - lastSweep < 60_000 && buckets.size < MAX_KEYS) return;
  lastSweep = now;
  if (buckets.size >= MAX_KEYS) {
    buckets.clear();
    return;
  }
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
};

export interface RateResult {
  ok: boolean;
  /** Segundos hasta que se libera la cuota (para el header Retry-After). */
  retryAfter: number;
}

/**
 * Devuelve ok=false si `key` superó `limit` peticiones dentro de `windowMs`.
 * @example rateLimit(`p:${token}`, 15, 10_000)  // 15 req / 10s por token
 */
export const rateLimit = (
  key: string,
  limit: number,
  windowMs: number,
): RateResult => {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > limit) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
};

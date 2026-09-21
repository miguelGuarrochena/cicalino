import "server-only";
import { rateLimit as rateLimitLocal, type RateResult } from "./rateLimit";

const URL_BASE = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const distributedRateLimit = Boolean(URL_BASE && TOKEN);

/* En Vercel production el rate limit tiene que ser global (Upstash). Un Map
 * por instancia no cuenta: hay N lambdas. Los polls del comensal siguen
 * fail-open (memoria) para no tumbar el QR si Redis falta. PIN, login, reset
 * y otras acciones sensibles pasan `{ failClosed: true }` y se niegan. */
export const requiresDistributedRateLimit = (): boolean =>
  process.env.VERCEL_ENV === "production" ||
  process.env.RATE_LIMIT_REQUIRE_UPSTASH === "1";

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
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: unknown; error?: string }[];
    return json.map((r) => r.result);
  } catch {
    return null;
  }
};

const cerrado = (): RateResult => ({ ok: false, retryAfter: 60 });

export const sharedRateLimit = async (
  key: string,
  limit: number,
  windowMs: number,
  opts?: { failClosed?: boolean },
): Promise<RateResult> => {
  const exigeRedis = requiresDistributedRateLimit();
  const failClosed = Boolean(opts?.failClosed);

  if (distributedRateLimit) {
    const ttl = Math.ceil(windowMs / 1000);
    const clave = `rl:${key}`;
    const r = await ejecutar([
      ["INCR", clave],
      ["EXPIRE", clave, String(ttl), "NX"],
      ["TTL", clave],
    ]);

    if (!r) {
      if (failClosed && exigeRedis) {
        console.error(
          "sharedRateLimit: Upstash no respondió — fail-closed",
        );
        return cerrado();
      }
      console.error(
        "sharedRateLimit: Upstash no respondió — fallback a límite en memoria",
      );
      return rateLimitLocal(key, limit, windowMs);
    }

    const cuenta = Number(r[0] ?? 0);
    const restante = Number(r[2] ?? ttl);
    if (cuenta > limit) {
      return { ok: false, retryAfter: restante > 0 ? restante : ttl };
    }
    return { ok: true, retryAfter: 0 };
  }

  if (exigeRedis) {
    if (failClosed) {
      console.error(
        "sharedRateLimit: falta UPSTASH_REDIS_REST_URL/TOKEN en producción — fail-closed",
      );
      return cerrado();
    }
    console.error(
      "sharedRateLimit: falta UPSTASH_REDIS_REST_URL/TOKEN en producción — usando límite en memoria",
    );
  }

  return rateLimitLocal(key, limit, windowMs);
};

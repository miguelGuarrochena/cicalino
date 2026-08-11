import "server-only";
import { rateLimit as rateLimitLocal, type RateResult } from "./rateLimit";

const URL_BASE = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const distributedRateLimit = Boolean(URL_BASE && TOKEN);

/* En Vercel production el rate limit tiene que ser global: sin Upstash cada
 * instancia tiene su propio Map y un atacante multiplica el cupo por el
 * número de lambdas. Local / preview / CI siguen con memoria (un solo
 * proceso). Forzá el fail-closed en cualquier entorno con
 * RATE_LIMIT_REQUIRE_UPSTASH=1. */
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

const denegar = (retryAfter: number): RateResult => ({
  ok: false,
  retryAfter,
});

export const sharedRateLimit = async (
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateResult> => {
  const exigeRedis = requiresDistributedRateLimit();

  if (exigeRedis && !distributedRateLimit) {
    console.error(
      "sharedRateLimit: falta UPSTASH_REDIS_REST_URL/TOKEN en producción",
    );
    return denegar(60);
  }

  const local = rateLimitLocal(key, limit, windowMs);
  if (!local.ok) return local;
  if (!distributedRateLimit) return local;

  const ttl = Math.ceil(windowMs / 1000);
  const clave = `rl:${key}`;
  const r = await ejecutar([
    ["INCR", clave],
    ["EXPIRE", clave, String(ttl), "NX"],
    ["TTL", clave],
  ]);

  if (!r) {
    /* Redis caído: en prod no abrimos el cupo por instancia; en local
     * seguimos con memoria para no trabar el desarrollo. */
    if (exigeRedis) {
      console.error("sharedRateLimit: Upstash no respondió, fail-closed");
      return denegar(ttl > 0 ? ttl : 30);
    }
    return local;
  }

  const cuenta = Number(r[0] ?? 0);
  const restante = Number(r[2] ?? ttl);
  if (cuenta > limit) {
    return { ok: false, retryAfter: restante > 0 ? restante : ttl };
  }
  return { ok: true, retryAfter: 0 };
};

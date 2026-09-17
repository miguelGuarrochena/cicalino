import { describe, it, expect, vi } from "vitest";
import {
  isJwtIssuedAtFuture,
  fetchWithJwtSkewRetry,
  JWT_FUTURE_RETRIES,
} from "@/lib/supabase/jwtSkewRetry";
import { desdeSupabase } from "@/lib/data/result";

const futureBody = JSON.stringify({
  code: "PGRST303",
  message: "JWT issued at future",
});

describe("JWT issued at future — reintento", () => {
  it("reconoce PGRST303 y el mensaje, y no otros 401", () => {
    expect(isJwtIssuedAtFuture(401, futureBody)).toBe(true);
    expect(isJwtIssuedAtFuture(401, "JWT issued at future")).toBe(true);
    expect(isJwtIssuedAtFuture(401, JSON.stringify({ code: "PGRST301" }))).toBe(
      false,
    );
    expect(isJwtIssuedAtFuture(200, futureBody)).toBe(false);
  });

  it("reintenta el mismo request y devuelve el que funcionó", async () => {
    const ok = new Response("[]", { status: 200 });
    const bad = () =>
      new Response(futureBody, { status: 401, headers: { "content-type": "application/json" } });
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(bad())
      .mockResolvedValueOnce(ok);
    const wait = vi.fn(async () => undefined);

    const res = await fetchWithJwtSkewRetry("https://example/rest/v1/esperas", {}, {
      fetch: doFetch as unknown as typeof fetch,
      wait,
    });
    expect(res.status).toBe(200);
    expect(doFetch).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("un 401 de permiso no se reintenta", async () => {
    const denied = new Response(JSON.stringify({ code: "42501", message: "denied" }), {
      status: 401,
    });
    const doFetch = vi.fn().mockResolvedValue(denied);
    const res = await fetchWithJwtSkewRetry("/x", {}, {
      fetch: doFetch as unknown as typeof fetch,
      wait: async () => undefined,
    });
    expect(res.status).toBe(401);
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  it("agota los reintentos y deja el último 401", async () => {
    const doFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(futureBody, {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const res = await fetchWithJwtSkewRetry("/x", {}, {
      fetch: doFetch as unknown as typeof fetch,
      wait: async () => undefined,
    });
    expect(res.status).toBe(401);
    expect(doFetch).toHaveBeenCalledTimes(1 + JWT_FUTURE_RETRIES);
  });

  it("desdeSupabase lo trata como conexión, no como permiso", () => {
    expect(
      desdeSupabase({ message: "JWT issued at future", code: "PGRST303" }).kind,
    ).toBe("conexion");
    expect(desdeSupabase({ message: "JWT issued at future" }).kind).toBe(
      "conexion",
    );
  });
});

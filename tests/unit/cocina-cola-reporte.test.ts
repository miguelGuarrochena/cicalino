import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { fetchKitchenQueue } from "@/lib/data/orders";

/* El issue de producción `panel.cocina.listas` es este select (hoy
 * `panel.cocina.cola`): el poll global lo corre aunque el empleado esté en
 * Pagos. postgrest-js, si fetch tira, devuelve status 0 y el mensaje
 * `TypeError: Failed to fetch`. Eso no es una respuesta de Supabase. */

const BRANCH = "11111111-1111-1111-1111-111111111111";

const conRespuesta = (resp: {
  error: { message: string; code: string };
  status: number;
}) => {
  const limit = vi.fn().mockResolvedValue({
    data: null,
    count: null,
    statusText: "",
    ...resp,
  });
  const order = vi.fn(() => ({ limit }));
  const gte = vi.fn(() => ({ order }));
  const eqEstado = vi.fn(() => ({ gte }));
  const eqLocal = vi.fn(() => ({ eq: eqEstado }));
  const select = vi.fn(() => ({ eq: eqLocal }));
  const from = vi.fn(() => ({ select }));
  vi.mocked(createBrowserSupabase).mockReturnValue({ from } as never);
  return { from, select };
};

describe("fetchKitchenQueue — qué se reporta a Sentry", () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("status 0 y Failed to fetch: no va a Sentry y la UI recibe conexion", async () => {
    const { from, select } = conRespuesta({
      error: { message: "TypeError: Failed to fetch", code: "" },
      status: 0,
    });

    const res = await fetchKitchenQueue(BRANCH);

    expect(from).toHaveBeenCalledWith("pedidos");
    expect(select).toHaveBeenCalledWith(
      "id, referencia, creado_en, cocina_hecha_en, autoservicio, sesion_id, mesa_sesiones(mesa_numero, flujo)",
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "[panel.cocina.cola] TypeError: Failed to fetch",
      { branchId: BRANCH },
    );
    expect(res).toEqual({
      ok: false,
      error: { kind: "conexion", message: "TypeError: Failed to fetch" },
    });
  });

  it("42501: la consulta sí llegó y se reporta", async () => {
    conRespuesta({
      error: { message: "permission denied for table pedidos", code: "42501" },
      status: 403,
    });

    const res = await fetchKitchenQueue(BRANCH);

    expect(Sentry.captureException).toHaveBeenCalledOnce();
    const [err, hint] = vi.mocked(Sentry.captureException).mock.calls[0]!;
    expect((err as Error).message).toBe("permission denied for table pedidos");
    expect(hint).toMatchObject({
      tags: { scope: "panel.cocina.cola" },
      extra: { branchId: BRANCH },
    });
    expect(res).toEqual({
      ok: false,
      error: { kind: "permiso", message: "permission denied for table pedidos" },
    });
  });
});

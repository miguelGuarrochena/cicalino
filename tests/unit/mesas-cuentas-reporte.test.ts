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
import { fetchTableBills } from "@/lib/data/tables";

/* Qué va a Sentry cuando falla `mesas_cuentas`.
 *
 * El panel lo pollea cada pocos segundos desde el header, así que un wifi que
 * parpadea llenaba Sentry de `Failed to fetch`. Eso deja de reportarse; lo que
 * llega con respuesta HTTP (permisos, JWT, SQL) se sigue reportando. */

const BRANCH = "11111111-1111-1111-1111-111111111111";

const conRespuesta = (resp: {
  error: { message: string; code: string; details?: string; hint?: string };
  status: number;
}) => {
  const rpc = vi.fn().mockResolvedValue({
    data: null,
    count: null,
    statusText: "",
    ...resp,
  });
  vi.mocked(createBrowserSupabase).mockReturnValue({ rpc } as never);
  return rpc;
};

const captura = () => {
  expect(Sentry.captureException).toHaveBeenCalledOnce();
  const [err, hint] = vi.mocked(Sentry.captureException).mock.calls[0]!;
  return { err: err as Error, hint };
};

describe("fetchTableBills — qué se reporta a Sentry", () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin respuesta HTTP (status 0, conexion): no reporta y la UI recibe el error", async () => {
    /* Lo que devuelve postgrest-js cuando el fetch tira TypeError. */
    const rpc = conRespuesta({
      error: {
        message: "TypeError: Failed to fetch (llxplysfirfcvcipbxss.supabase.co)",
        details: "",
        hint: "",
        code: "",
      },
      status: 0,
    });

    const res = await fetchTableBills(BRANCH);

    expect(rpc).toHaveBeenCalledWith("mesas_cuentas", { p_local: BRANCH });
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect(res).toEqual({
      ok: false,
      error: {
        kind: "conexion",
        message: "TypeError: Failed to fetch (llxplysfirfcvcipbxss.supabase.co)",
      },
    });
  });

  it("PGRST303 con 401: también es conexion, pero hubo respuesta y se reporta", async () => {
    const error = { message: "JWT issued at future", code: "PGRST303" };
    conRespuesta({ error, status: 401 });

    const res = await fetchTableBills(BRANCH);

    const { err, hint } = captura();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("JWT issued at future");
    expect(hint).toMatchObject({
      tags: { scope: "panel.mesas.cuentas" },
      extra: { branchId: BRANCH },
    });
    expect(res).toEqual({
      ok: false,
      error: { kind: "conexion", message: "JWT issued at future" },
    });
  });

  it("42501 con 403: permiso, se reporta", async () => {
    const error = { message: "permission denied for function mesas_cuentas", code: "42501" };
    conRespuesta({ error, status: 403 });

    const res = await fetchTableBills(BRANCH);

    const { err, hint } = captura();
    expect(err.message).toBe("permission denied for function mesas_cuentas");
    expect(hint).toMatchObject({
      tags: { scope: "panel.mesas.cuentas" },
      extra: { branchId: BRANCH },
    });
    expect(res).toEqual({
      ok: false,
      error: { kind: "permiso", message: "permission denied for function mesas_cuentas" },
    });
  });
});

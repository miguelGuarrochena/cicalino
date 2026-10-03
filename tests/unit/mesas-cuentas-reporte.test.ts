import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: vi.fn(),
}));
vi.mock("@/lib/observability", () => ({
  reportError: vi.fn(),
  reportWarning: vi.fn(),
}));

import { createBrowserSupabase } from "@/lib/supabase/client";
import { reportError } from "@/lib/observability";
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

describe("fetchTableBills — qué se reporta a Sentry", () => {
  beforeEach(() => {
    vi.mocked(reportError).mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
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
    expect(reportError).not.toHaveBeenCalled();
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

    expect(reportError).toHaveBeenCalledWith("panel.mesas.cuentas", error, {
      branchId: BRANCH,
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

    expect(reportError).toHaveBeenCalledWith("panel.mesas.cuentas", error, {
      branchId: BRANCH,
    });
    expect(res).toEqual({
      ok: false,
      error: { kind: "permiso", message: "permission denied for function mesas_cuentas" },
    });
  });
});

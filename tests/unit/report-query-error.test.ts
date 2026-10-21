import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { reportQueryError } from "@/lib/observability";

/* El poll de cocina (`panel.cocina.listas`, hoy `panel.cocina.cola`) manda
 * a Sentry el TypeError que postgrest-js arma cuando fetch no obtiene
 * respuesta. Eso es el wifi. Una respuesta HTTP sigue siendo un fallo
 * nuestro y se reporta. */

describe("reportQueryError", () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("status 0 y Failed to fetch: no va a Sentry y la UI recibe conexion", () => {
    const error = { message: "TypeError: Failed to fetch", code: "" };
    const fallo = reportQueryError("panel.cocina.cola", error, 0, {
      branchId: "b1",
    });

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect(fallo).toEqual({
      kind: "conexion",
      message: "TypeError: Failed to fetch",
    });
  });

  it("AbortError con status 0 no es un corte de red reconocible: se reporta", () => {
    const error = { message: "AbortError: The user aborted a request.", code: "" };
    const fallo = reportQueryError("panel.cocina.cola", error, 0);

    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(fallo.kind).toBe("desconocido");
  });

  it("PGRST303 con 401: hubo respuesta, se reporta", () => {
    const error = { message: "JWT issued at future", code: "PGRST303" };
    const fallo = reportQueryError("panel.cocina.cola", error, 401, {
      branchId: "b1",
    });

    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(fallo.kind).toBe("conexion");
  });

  it("42501: permiso, se reporta", () => {
    const error = { message: "permission denied for table pedidos", code: "42501" };
    const fallo = reportQueryError("panel.cocina.cola", error, 403);

    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(fallo).toEqual({
      kind: "permiso",
      message: "permission denied for table pedidos",
    });
  });
});

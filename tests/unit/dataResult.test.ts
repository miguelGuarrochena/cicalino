import { describe, it, expect } from "vitest";
import { ok, fail, desdeSupabase } from "@/lib/data/result";

describe("ok / fail", () => {
  it("ok lleva los datos", () => {
    const r = ok([1, 2, 3]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([1, 2, 3]);
  });

  it("una lista vacía sigue siendo un éxito", () => {
    // Este es el punto de todo el tipo: "no hay pedidos" y "falló la consulta"
    // dejan de ser el mismo [].
    const r = ok<number[]>([]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([]);
  });

  it("fail lleva el error", () => {
    const r = fail<number[]>({ kind: "conexion", message: "sin red" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("conexion");
  });
});

describe("desdeSupabase", () => {
  it("42501 es un problema de permisos, no de red", () => {
    // Reintentar no sirve: es RLS, suscripción vencida o sesión caída.
    expect(desdeSupabase({ message: "denied", code: "42501" }).kind).toBe(
      "permiso",
    );
  });

  it("un JWT vencido también es permiso", () => {
    expect(desdeSupabase({ message: "JWT expired", code: "PGRST301" }).kind).toBe(
      "permiso",
    );
  });

  it("un fallo de fetch sin código es conexión", () => {
    expect(desdeSupabase({ message: "Failed to fetch" }).kind).toBe("conexion");
    expect(desdeSupabase({ message: "network error" }).kind).toBe("conexion");
  });

  it("un error con código no se toma como conexión aunque hable de red", () => {
    // Si vino con código, el servidor contestó: no es la wifi del local.
    expect(
      desdeSupabase({ message: "network table missing", code: "42P01" }).kind,
    ).toBe("desconocido");
  });

  it("cualquier otra cosa queda como desconocido", () => {
    expect(desdeSupabase({ message: "boom", code: "23505" }).kind).toBe(
      "desconocido",
    );
    expect(desdeSupabase({ message: "algo raro" }).kind).toBe("desconocido");
  });

  it("conserva el mensaje original para poder debuggear", () => {
    expect(desdeSupabase({ message: "duplicate key", code: "23505" }).message).toBe(
      "duplicate key",
    );
  });
});

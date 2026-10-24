import { describe, it, expect } from "vitest";
import {
  email,
  identificationMode,
  orderStatus,
  plan,
  textField,
  tipoNegocio,
  uuid,
} from "@/lib/schemas/common";
import { customerAliasSchema, pedidosModalidad, qrTokenSchema } from "@/lib/schemas";

/* zod 3 → 4 (GHSA-mrhx-c7xc-m3w5). Las opciones de mensaje cambiaron de nombre
 * (`required_error`, `invalid_type_error`, `errorMap` → `error`) y `.uuid()` se
 * volvió estricto. Lo que ve el usuario y lo que se acepta tiene que seguir
 * igual que antes. */

const mensaje = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? null : r.error!.issues[0]!.message;

describe("zod 4: mismos mensajes que con zod 3", () => {
  it("un campo de texto distingue faltante de tipo inválido", () => {
    const nombre = textField(2, 40, "el nombre");
    expect(mensaje(nombre.safeParse(undefined))).toBe("Falta el nombre.");
    expect(mensaje(nombre.safeParse(42))).toBe("el nombre inválido.");
    expect(mensaje(nombre.safeParse("a"))).toBe("el nombre: mínimo 2 caracteres.");
    expect(nombre.safeParse("  Ana  ").data).toBe("Ana");
  });

  it("email: falta, formato y normalización", () => {
    expect(mensaje(email.safeParse(undefined))).toBe("Falta el email.");
    expect(mensaje(email.safeParse("no-es-un-mail"))).toBe("Email inválido.");
    expect(email.safeParse("  Ana@Cafe.COM.ar ").data).toBe("ana@cafe.com.ar");
    expect(email.safeParse("juan.perez+pedidos@gmail.com").success).toBe(true);
  });

  it.each([
    [tipoNegocio, "kiosco", "Tipo de negocio inválido."],
    [identificationMode, "turno", "Modo de identificación inválido."],
    [orderStatus, "perdido", "Estado de pedido inválido."],
    [plan, "semanal", "Plan inválido."],
    [pedidosModalidad, "delivery", "Modalidad de Pedidos inválida."],
  ] as const)("enum con su mensaje propio", (schema, valor, esperado) => {
    expect(mensaje(schema.safeParse(valor))).toBe(esperado);
  });

  it("el alias del cliente: tipo inválido con su mensaje, vacío permitido", () => {
    expect(mensaje(customerAliasSchema.safeParse(7))).toBe("Nombre inválido.");
    expect(customerAliasSchema.safeParse("").success).toBe(true);
    expect(customerAliasSchema.safeParse("  Ana   María ").data).toBe("Ana María");
  });
});

describe("zod 4: los ids se aceptan con el mismo criterio que antes", () => {
  it("acepta cualquier 8-4-4-4-12 hexadecimal, también los que no son RFC 9562", () => {
    for (const id of [
      crypto.randomUUID(),
      "11111111-1111-4111-8111-111111111111",
      "00000000-0000-0000-0000-000000000001",
      "ABCDEFAB-1234-5678-9ABC-DEF012345678",
    ]) {
      expect(uuid.safeParse(id).success, id).toBe(true);
      expect(qrTokenSchema.safeParse(id).success, id).toBe(true);
    }
  });

  it("rechaza lo que no tiene ese formato", () => {
    for (const id of ["", "nope", "1111-1111", "11111111-1111-4111-8111-11111111111g", "../etc/passwd"]) {
      expect(mensaje(uuid.safeParse(id)), id).toBe("Identificador inválido.");
    }
  });
});

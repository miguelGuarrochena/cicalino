import { z } from "zod";

export const textField = (min: number, max: number, campo: string) =>
  z
    .string({ error: (iss) => (iss.input === undefined ? `Falta ${campo}.` : `${campo} inválido.`) })
    .trim()
    .min(min, `${campo}: mínimo ${min} caracteres.`)
    .max(max, `${campo}: máximo ${max} caracteres.`);

export const optionalTextField = (max: number, campo: string) =>
  z
    .string()
    .trim()
    .max(max, `${campo}: máximo ${max} caracteres.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : undefined));

export const email = z
  .string({ error: (iss) => (iss.input === undefined ? "Falta el email." : undefined) })
  .trim()
  .toLowerCase()
  .min(5, "Email inválido.")
  .max(160, "Email demasiado largo.")
  .email("Email inválido.");

/* zod 4 hace estricto `.uuid()` (RFC 9562); `guid` es el formato
 * 8-4-4-4-12 que aceptaba zod 3, así ningún id que hoy pasa deja de pasar. */
export const uuid = z.guid("Identificador inválido.");

export const cuil = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v.replace(/\D/g, "") : ""))
  .refine((d) => d === "" || d.length === 11, "El CUIL/CUIT debe tener 11 dígitos.");

export const telefono = z
  .string()
  .trim()
  .max(30, "Teléfono demasiado largo.")
  .optional()
  .nullable()
  .transform((v) => (v ? v : ""))
  .refine(
    (v) => v === "" || v.replace(/\D/g, "").length >= 8,
    "El teléfono necesita al menos 8 dígitos.",
  );

export const pin4 = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v.replace(/\D/g, "") : ""))
  .refine((v) => v === "" || v.length === 4, "El PIN tiene que ser de 4 dígitos.");

export const tipoNegocio = z.enum(
  [
    "cafeteria",
    "panaderia",
    "rotiseria",
    "heladeria",
    "bar",
    "restaurante",
    "pasteleria",
    "food_truck",
    "otro",
  ],
  { error: "Tipo de negocio inválido." },
);

export const identificationMode = z.enum(["pedido", "nombre", "mesa"], {
  error: "Modo de identificación inválido.",
});

export const orderStatus = z.enum(
  ["pendiente_pago", "creado", "en_preparacion", "listo", "retirado", "cancelado"],
  { error: "Estado de pedido inválido." },
);

export const plan = z.enum(["mensual", "anual", "gratis"], {
  error: "Plan inválido.",
});

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const parseInput = <S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
): ParseResult<z.infer<S>> => {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const primero = r.error.issues[0];
  return { ok: false, error: primero?.message ?? "Datos inválidos." };
};

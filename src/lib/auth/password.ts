/* Reglas de la contraseña, compartidas entre la Server Action y el
 * formulario. Van en un módulo aparte porque un archivo "use server" solo
 * puede exportar funciones async: una constante ahí rompe el build. */

/* Supabase acepta 6 por defecto; acá pedimos 8. Es la única contraseña que
 * separa a un tercero del panel de un local. */
export const PASSWORD_MIN = 8;

/* Motivos, no frases: la pantalla los traduce con t(). */
export type ResetReason =
  | "invalido"
  | "expirado"
  | "corta"
  | "rate-limited"
  | "no-configurado"
  | "error";

export type ResetResult = { ok: true } | { ok: false; reason: ResetReason };

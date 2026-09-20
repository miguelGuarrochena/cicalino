/* ¿El navegador trae la cookie de sesión de Supabase?
 *
 * Supabase SSR guarda el token en `sb-<ref>-auth-token` y, cuando no entra en
 * una sola cookie, lo parte en `sb-<ref>-auth-token.0`, `.1`, etc.
 *
 * Mirar el nombre no valida nada: la cookie puede estar vencida. Sirve para
 * decidir a dónde mandar a alguien (la home o el panel) sin pagar una llamada
 * a Supabase Auth en una ruta pública. Quien autoriza sigue siendo /panel.
 *
 * `-auth-token-code-verifier` queda afuera a propósito: esa cookie aparece en
 * medio del login, cuando todavía no hay sesión. */
const COOKIE_SESION = /^sb-.+-auth-token(\.\d+)?$/;

export const tieneCookieDeSesion = (nombres: readonly string[]): boolean =>
  nombres.some((n) => COOKIE_SESION.test(n));


const supabaseHost = (): string => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return "";
  try {
    return new URL(raw).host;
  } catch {
    return "";
  }
};

/* Rutas que Next renderiza en cada request.
 *
 * ACÁ ESTÁ TODO EL ASUNTO. El nonce es un número al azar que tiene que
 * aparecer a la vez en la cabecera CSP y en cada <script> del HTML. Para eso
 * el HTML se tiene que armar en el momento del request, que es cuando el
 * middleware genera el nonce.
 *
 * Las páginas estáticas se generan en el build, donde todavía no hay request
 * ni nonce, así que sus scripts internos de Next (`self.__next_f.push(...)`)
 * salen sin él. Medido sobre el build real: la landing tiene 9 scripts inline
 * sin nonce, /login 7, /panel 10. Con la CSP activa el navegador los
 * bloquearía y esas páginas quedarían sin JavaScript.
 *
 * Por eso la política se arma distinta según la ruta. Las de esta lista son
 * las dinámicas (ƒ en la salida de `next build`), donde el nonce sí llega y
 * la protección contra scripts inyectados funciona de verdad.
 *
 * Si alguna vez una ruta de acá deja de ser dinámica, o al revés, hay que
 * actualizar esta lista: `next build` lo muestra con ○ (estática) y ƒ
 * (dinámica). */
const RUTAS_CON_NONCE = ["/p/", "/e/", "/aceptar/", "/admin", "/recuperar"];

export const admiteNonce = (pathname: string): boolean =>
  RUTAS_CON_NONCE.some(
    (p) => pathname.startsWith(p) || pathname === p.replace(/\/$/, ""),
  );

export const buildCsp = (
  nonce: string,
  enforce = false,
  pathname = "",
): string => {
  const sb = supabaseHost();
  const conexiones = [
    "'self'",
    sb ? `https://${sb}` : "",
    sb ? `wss://${sb}` : "",
    "https://challenges.cloudflare.com",
    "https://vitals.vercel-insights.com",
  ].filter(Boolean);

  /* Ojo con la tentación de poner las dos: cuando hay un nonce, el navegador
   * IGNORA 'unsafe-inline' por completo. Es una u otra. */
  const scriptSrc = admiteNonce(pathname)
    ? `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`
    : `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    `connect-src ${conexiones.join(" ")}`,
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob: https://challenges.cloudflare.com",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    enforce ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");
};

export const cspEnforce = (): boolean => process.env.CSP_ENFORCE === "1";

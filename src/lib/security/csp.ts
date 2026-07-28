// Content-Security-Policy de Cicalino.
//
// Es la mitigación de fondo contra XSS: aunque se cuele HTML del usuario, el
// navegador no ejecuta scripts que no estén explícitamente permitidos.
//
// Next (App Router) inyecta sus propios <script> inline con los datos de
// hidratación, así que necesitan un nonce por request. Next lo detecta solo si
// el header CSP viene en el REQUEST desde el middleware.
//
// Arranca en modo Report-Only (CSP_ENFORCE != "1"): el navegador reporta las
// violaciones en consola pero no bloquea nada. Probá el panel, el modal de QR,
// el push y el realtime, y cuando la consola esté limpia poné CSP_ENFORCE=1.

const supabaseHost = (): string => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return "";
  try {
    return new URL(raw).host;
  } catch {
    return "";
  }
};

export const buildCsp = (nonce: string): string => {
  const sb = supabaseHost();
  const conexiones = [
    "'self'",
    sb ? `https://${sb}` : "",
    // Realtime de Supabase va por WebSocket.
    sb ? `wss://${sb}` : "",
    "https://challenges.cloudflare.com",
    // Vercel Analytics.
    "https://vitals.vercel-insights.com",
  ].filter(Boolean);

  return [
    "default-src 'self'",
    // Scripts: solo los nuestros, los de Next con nonce, y el widget de
    // Turnstile (que se inyecta con createElement desde /probar).
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    // Los estilos inline los genera Next/Tailwind; 'unsafe-inline' acá es un
    // riesgo bajo comparado con el de scripts.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    // Los QR se generan como data: URL en el cliente.
    "img-src 'self' data: blob:",
    `connect-src ${conexiones.join(" ")}`,
    // El widget de Turnstile se dibuja en un iframe.
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    // Nadie nos puede embeber (equivalente moderno de X-Frame-Options).
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
};

/** true = bloquea de verdad; false = solo reporta. */
export const cspEnforce = (): boolean => process.env.CSP_ENFORCE === "1";

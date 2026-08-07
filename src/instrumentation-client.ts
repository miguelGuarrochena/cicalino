import * as Sentry from "@sentry/nextjs";

/* Sentry en el navegador.
 *
 * Sin DSN no arranca, y la app funciona igual: mismo criterio que Upstash,
 * Resend y Turnstile. Así un deploy sin la variable no se rompe, solo deja de
 * reportar. */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,

    /* La app maneja datos de terceros: nombres de clientes en la lista de
     * espera, referencias de pedido, mails de dueños. Nada de eso tiene por
     * qué salir del sistema para saber que algo falló, así que no mandamos
     * datos de usuario ni cuerpos de request. El contexto que sí sirve
     * (branchId, orgId) son UUIDs y lo agrega reportError a mano. */
    sendDefaultPii: false,

    /* La pantalla del cliente pollea cada 3-8 segundos mientras espera su
     * pedido. Con el 10% que viene por defecto, esas consultas ahogarían la
     * cuota y enterrarían las trazas que sirven. */
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.02,

    enableLogs: true,

    /* Session Replay queda afuera a propósito: graba el DOM, y el panel
     * muestra nombres de clientes. Es una decisión de privacidad, no un
     * olvido. */
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

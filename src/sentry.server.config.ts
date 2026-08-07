import * as Sentry from "@sentry/nextjs";

/* Sentry en el runtime de Node (server actions, route handlers, RSC). */
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    /* Más alto que en el cliente: acá no está el polling del cliente final, y
     * son las trazas del panel y del cron, que son las que importan. */
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    includeLocalVariables: true,
    enableLogs: true,
  });
}

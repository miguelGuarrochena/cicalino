import * as Sentry from "@sentry/nextjs";

/* Sentry en el edge: acá corre el middleware, que es lo único que queda en
 * ese runtime. */
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.02,
    enableLogs: true,
  });
}

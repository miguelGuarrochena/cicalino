import * as Sentry from "@sentry/nextjs";

export const register = async () => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
};

/* Captura los errores de request del servidor que no pasan por ningún
 * try/catch nuestro. */
export const onRequestError = Sentry.captureRequestError;

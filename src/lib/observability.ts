/* One place where failures get reported.
 *
 * Goes to Sentry and to the console. The console line is what you want while
 * developing; Sentry is what's there when a shop calls saying it isn't working
 * and you weren't watching.
 *
 * The context is the part that matters. `console.error("fetchTodayOrders",
 * err.message)` tells you a query failed; it doesn't tell you which branch,
 * which is the first thing you need to reproduce it. Everything passed here is
 * ids and scope names — no customer names, no emails. Sentry is configured
 * with sendDefaultPii: false so the SDK doesn't add any either.
 *
 * With no DSN configured, Sentry.init never ran and these calls are no-ops, so
 * the app behaves exactly as it did before.
 */
import * as Sentry from "@sentry/nextjs";
import { desdeSupabase, type DataError } from "@/lib/data/result";

export interface ErrorContext {
  branchId?: string | null;
  organizationId?: string | null;
  orderId?: string | null;
  waitlistId?: string | null;
  [key: string]: unknown;
}

const mensaje = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
};

/* `scope` identifies the operation, not the file: "panel.pedidos.cargar" reads
 * better in a log than "fetchTodayOrders". */
export const reportError = (
  scope: string,
  err: unknown,
  context: ErrorContext = {},
): void => {
  const limpio = Object.fromEntries(
    Object.entries(context).filter(([, v]) => v != null),
  );
  console.error(`[${scope}] ${mensaje(err)}`, limpio);

  Sentry.captureException(err instanceof Error ? err : new Error(mensaje(err)), {
    /* `scope` agrupa: todos los fallos de "panel.pedidos.cargar" caen en el
     * mismo issue en vez de uno por mensaje de Postgres. */
    tags: { scope },
    extra: limpio,
  });
};

/* A background poll whose fetch never got an HTTP response.
 *
 * postgrest-js turns `TypeError: Failed to fetch` into an error object with
 * status 0. That is the shop's wifi or the laptop waking up, and the polls
 * run every few seconds, so sending it to Sentry drowns the issues that are
 * actually ours. The caller still gets `kind: "conexion"` and can keep the
 * last good data or show the sync banner.
 *
 * A connection-shaped error that DID get a response (PGRST303 on 401) is
 * reported: the server answered, and that is worth seeing. */
export const reportQueryError = (
  scope: string,
  error: { message: string; code?: string },
  status: number,
  context: ErrorContext = {},
): DataError => {
  const fallo = desdeSupabase(error);
  if (fallo.kind === "conexion" && status === 0) {
    const limpio = Object.fromEntries(
      Object.entries(context).filter(([, v]) => v != null),
    );
    console.warn(`[${scope}] ${fallo.message}`, limpio);
    return fallo;
  }
  reportError(scope, error, context);
  return fallo;
};

/* For things that aren't failures but shouldn't happen either — a list hitting
 * its row cap, a state transition that didn't take. Worth seeing, not worth
 * paging anyone about. */
export const reportWarning = (
  scope: string,
  detalle: string,
  context: ErrorContext = {},
): void => {
  const limpio = Object.fromEntries(
    Object.entries(context).filter(([, v]) => v != null),
  );
  console.warn(`[${scope}] ${detalle}`, limpio);

  /* Mensaje y no excepción: no hay nada roto, es algo que conviene mirar. */
  Sentry.captureMessage(`[${scope}] ${detalle}`, {
    level: "warning",
    tags: { scope },
    extra: limpio,
  });
};

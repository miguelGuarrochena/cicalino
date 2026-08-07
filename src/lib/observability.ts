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

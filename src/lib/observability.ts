/* One place where failures get reported.
 *
 * Right now this only writes to the console, which in a browser means it goes
 * nowhere: when a shop calls saying "it's not working", there's nothing to
 * look at. That's the actual problem, and it isn't solved yet — what this does
 * is stop the reporting from being scattered across forty call sites, so
 * wiring up a real service later is one function instead of a sweep.
 *
 * The context is the part that matters. `console.error("fetchTodayOrders",
 * err.message)` tells you a query failed; it doesn't tell you which branch,
 * which is the first thing you need to reproduce it.
 */

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
};

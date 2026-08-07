/* Result type for the data layer.
 *
 * Every read used to swallow its error and return an empty array:
 *
 *     if (error) { console.error("fetchTodayOrders", error.message); return []; }
 *
 * So the panel couldn't tell "no orders yet" from "the query failed", and drew
 * the same empty screen either way. A shop with a flaky connection sees a
 * clean panel and assumes there's nothing to make.
 *
 * Same shape as ParseResult in schemas/common.ts, on purpose — one way of
 * saying "this worked or it didn't" across the codebase.
 */

export type DataErrorKind =
  /* Couldn't reach Supabase, or it didn't answer. Usually the shop's wifi. */
  | "conexion"
  /* Reached it and got told no. Means RLS, an expired subscription, or a
   * session that went stale — retrying won't help. */
  | "permiso"
  | "desconocido";

export interface DataError {
  kind: DataErrorKind;
  message: string;
}

export type DataResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DataError };

export const ok = <T>(data: T): DataResult<T> => ({ ok: true, data });

export const fail = <T>(error: DataError): DataResult<T> => ({
  ok: false,
  error,
});

/* Postgres and PostgREST error codes worth telling apart.
 *
 * 42501 is Postgres "insufficient privilege"; PGRST301 is PostgREST's own
 * "JWT expired". Both mean the user won't get anywhere by retrying, which is
 * the difference the UI cares about. */
const CODIGOS_PERMISO = new Set(["42501", "PGRST301", "PGRST302"]);

/* Turn a supabase-js error into ours. */
export const desdeSupabase = (err: {
  message: string;
  code?: string;
}): DataError => {
  if (err.code && CODIGOS_PERMISO.has(err.code)) {
    return { kind: "permiso", message: err.message };
  }
  /* supabase-js surfaces network failures as a TypeError from fetch, which
   * arrives here with no code and this message. */
  if (!err.code && /fetch|network|failed to fetch/i.test(err.message)) {
    return { kind: "conexion", message: err.message };
  }
  return { kind: "desconocido", message: err.message };
};

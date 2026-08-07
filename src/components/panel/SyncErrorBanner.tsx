"use client";

import { useApp } from "@/components/providers/Providers";
import type { DataError } from "@/lib/data/result";

/* Shown when the last refresh failed.
 *
 * The list underneath keeps whatever it last loaded, so this says "what you're
 * looking at may be out of date" rather than replacing the screen. A counter
 * mid-service is better off with slightly stale orders and a warning than with
 * an error page.
 *
 * Before this, a failed query returned an empty array and the panel drew its
 * "no orders yet" state. A shop on flaky wifi saw a clean screen and assumed
 * there was nothing to make. */
export const SyncErrorBanner = ({ error }: { error: DataError | null }) => {
  const { locale } = useApp();
  if (!error) return null;
  const es = locale !== "en";

  /* A permission error won't fix itself by waiting, so it gets a different
   * instruction: it means the session went stale or the subscription lapsed. */
  const esPermiso = error.kind === "permiso";

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-2xl border border-amber-400/60 bg-amber-50/80 px-3.5 py-3 dark:bg-amber-400/10"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 shrink-0 text-amber-600"
        aria-hidden="true"
      >
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          {esPermiso
            ? es
              ? "No pudimos leer los datos"
              : "Couldn't read the data"
            : es
              ? "Sin conexión con el servidor"
              : "No connection to the server"}
        </p>
        <p className="mt-0.5 text-sm text-carbon/65">
          {esPermiso
            ? es
              ? "Puede que tu sesión haya vencido. Salí y volvé a entrar."
              : "Your session may have expired. Sign out and back in."
            : es
              ? "Lo que ves puede estar desactualizado. Se reintenta solo."
              : "What you see may be out of date. It keeps retrying on its own."}
        </p>
      </div>
    </div>
  );
};

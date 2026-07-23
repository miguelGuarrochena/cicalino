"use client";

import { useEffect } from "react";
import Link from "next/link";

// Error boundary de la app (captura errores de render en las rutas).
const Error = ({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) => {
  useEffect(() => {
    // En producción, acá se envía a un servicio de logueo (Sentry, etc.).
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-crema px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </span>
      <div>
        <h1 className="font-display text-2xl uppercase tracking-tight text-carbon">
          Algo salió mal
        </h1>
        <p className="mt-2 max-w-sm text-sm text-carbon/60">
          Tuvimos un problema al cargar esta pantalla. Podés reintentar o volver
          al inicio.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          onClick={reset}
          className="rounded-full bg-marca px-5 py-2.5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="rounded-full border border-linea px-5 py-2.5 text-sm font-semibold text-carbon transition hover:bg-carbon/5"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
};

export default Error;

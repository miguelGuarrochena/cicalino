"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore } from "@/lib/store/session-store";

// Bloque cuando el rol actual no tiene acceso a la seccion.
export const NoAccess = () => {
  const { locale } = useApp();
  const empleadoActivo = useSessionStore((s) => s.empleadoActivo);
  const es = locale !== "en";
  const porFichaje = Boolean(empleadoActivo);

  return (
    <div className="flex flex-col items-center gap-3 rounded-[28px] border border-linea bg-surface/60 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-carbon/5 text-carbon/50">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </span>
      <p className="font-display text-xl uppercase tracking-tight text-carbon">
        {es ? "Sin acceso" : "No access"}
      </p>
      <p className="max-w-xs text-sm text-carbon/55">
        {porFichaje
          ? es
            ? `Hay alguien fichado (${empleadoActivo?.nombre}). Tocá Salir en Fichar para volver a Configuración o Métricas.`
            : `Someone is clocked in (${empleadoActivo?.nombre}). Tap Exit on Clock in to open Settings or Metrics again.`
          : es
            ? "Tu rol no puede ver esta sección. Cambiá de cuenta desde Entrar."
            : "Your role can't view this section. Switch account from Sign in."}
      </p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        <Link
          href="/panel"
          className="rounded-full bg-marca px-5 py-2.5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte"
        >
          {es ? "Volver a pedidos" : "Back to orders"}
        </Link>
        {!porFichaje && (
          <Link
            href="/login"
            className="rounded-full border border-linea px-5 py-2.5 text-sm font-semibold text-carbon transition hover:bg-carbon/5"
          >
            {es ? "Cambiar cuenta" : "Switch account"}
          </Link>
        )}
      </div>
    </div>
  );
};

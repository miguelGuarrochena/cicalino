"use client";

import { ThemedImg } from "@/components/ui/ThemedImg";

/** Loader de página / bloque: siempre la mascota. */
export const MascotLoader = ({
  className = "h-24 sm:h-28",
  label = "Cargando…",
}: {
  className?: string;
  label?: string;
}) => (
  <div
    className="flex flex-col items-center justify-center gap-2"
    role="status"
    aria-live="polite"
  >
    <ThemedImg name="bell" alt="" className={`u-float ${className}`} />
    <span className="sr-only">{label}</span>
  </div>
);

"use client";

import { ThemedImg } from "@/components/ui/ThemedImg";

/**
 * Loader de marca. Por defecto mascota; `inline` = anillo chico para botones.
 */
export const Spinner = ({
  className = "h-10",
  inline = false,
}: {
  className?: string;
  /** Anillo CSS para botones estrechos (no es el loader de página). */
  inline?: boolean;
}) =>
  inline ? (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-marca border-r-transparent ${className}`}
      aria-hidden
    />
  ) : (
    <ThemedImg
      name="bell"
      alt=""
      className={`u-float inline-block ${className}`}
    />
  );

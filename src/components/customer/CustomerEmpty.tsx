"use client";

import type { ReactNode } from "react";
import { ThemedImg } from "@/components/ui/ThemedImg";

/* Cuando todavía no hay nada.
 *
 * Los estados vacíos del comensal eran una línea gris chiquita y centrada:
 * "Todavía no pediste nada", "La carta todavía está vacía", "Todavía nadie
 * pagó". Con ese tamaño y ese gris parecían un error tenue, no una respuesta.
 *
 * Esto usa el mismo lenguaje que `/p/` y `/e/`, que son las dos pantallas que
 * ya funcionaban: la mascota, un título que se lee de lejos y dos renglones
 * que dicen qué va a pasar. La diferencia es el tamaño de la ilustración —acá
 * el vacío es una sección de la pantalla, no la pantalla entera. */
export const CustomerEmpty = ({
  titulo,
  cuerpo,
  accion,
  conMascota = false,
}: {
  titulo: string;
  cuerpo?: string;
  accion?: ReactNode;
  /* Solo cuando el vacío ocupa la pantalla entera. En una sección al lado de
   * otras cosas, la mascota compite en vez de acompañar. */
  conMascota?: boolean;
}) => (
  <div className="rounded-2xl border border-dashed border-linea px-6 py-10 text-center">
    {conMascota ? <ThemedImg name="bell" alt="" className="mx-auto mb-4 h-20 opacity-60" /> : null}
    <p className="font-display text-xl uppercase tracking-tight text-carbon">{titulo}</p>
    {cuerpo ? (
      <p className="mx-auto mt-2 max-w-sm text-base leading-relaxed text-suave">{cuerpo}</p>
    ) : null}
    {accion ? <div className="mt-5 flex justify-center">{accion}</div> : null}
  </div>
);

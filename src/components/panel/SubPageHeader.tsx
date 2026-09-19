"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/* La cabecera de las pantallas que se abren desde otra y a las que hay que
 * volver: imprimir QR, turnos, historial.
 *
 * El volver era un "← Pagos" en gris de 14 px, del mismo tamaño que cualquier
 * texto de la página. En una tablet, con el dedo y apurado, eso no es un
 * botón: es una frase. Acá es una píldora con borde, del mismo alto que el
 * resto de los botones de la app, y va arriba de todo — que es donde se lo
 * busca.
 *
 * Las tres usan esta misma, así se comportan igual: se entra desde Pagos y se
 * vuelve del mismo modo, sin tener que aprender una salida por pantalla. */
export const SubPageHeader = ({
  volverA,
  volverLabel,
  titulo,
  sub,
  acciones,
}: {
  volverA: string;
  volverLabel: string;
  titulo: string;
  sub?: string;
  /* Lo que la pantalla ofrece hacer, a la derecha del título. */
  acciones?: ReactNode;
}) => (
  <header className="flex flex-col gap-3 print:hidden">
    <Link
      href={volverA}
      className="flex min-h-11 w-fit items-center gap-2 rounded-full border border-linea bg-surface px-4 text-sm font-semibold text-carbon/70 transition hover:border-carbon/25 hover:text-carbon"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18 9 12l6-6" />
      </svg>
      {volverLabel}
    </Link>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-3xl uppercase tracking-tight text-carbon">
          {titulo}
        </h1>
        {sub ? <p className="max-w-xl text-sm text-carbon/60">{sub}</p> : null}
      </div>
      {acciones}
    </div>
  </header>
);

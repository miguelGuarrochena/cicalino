"use client";

import { formatHora } from "@/lib/espera/slots";
import { waitlistStatusLabel } from "@/lib/types";
import type { WaitlistView } from "@/lib/types";

/* Los grupos que se cancelaron en la jornada, con la opción de sacarlos de la
 * vista. Salió de espera/page.tsx sin cambios; el borrado y su toast quedaron
 * arriba, donde vive el hook de la sala. */
interface Props {
  canceladas: WaitlistView[];
  locale: string;
  onBorrar: (id: string) => void;
}

export const CanceladosHoy = ({ canceladas, locale, onBorrar }: Props) => {
  if (canceladas.length === 0) return null;
  return (
      <section>
        <h2 className="mb-3 text-sm font-semibold text-carbon/70">
          {locale === "en" ? "Cancelled today" : "Cancelados hoy"}
          {` · ${canceladas.length}`}
        </h2>
        <div className="flex flex-col gap-2">
          {canceladas.slice(0, 8).map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-linea bg-surface/70 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-carbon/70">
                  {e.name}
                </p>
                <p className="text-xs text-carbon/45">
                  {e.partySize}{" "}
                  {locale === "en" ? "guests" : "personas"}
                  {e.cancelledAt
                    ? ` · ${formatHora(e.cancelledAt, locale)}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-alerta-fondo px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-alerta">
                  {waitlistStatusLabel("cancelado", locale === "en" ? "en" : "es")}
                </span>
                <button
                  type="button"
                  aria-label={locale === "en" ? "Delete" : "Borrar"}
                  title={locale === "en" ? "Delete" : "Borrar"}
                  onClick={() => onBorrar(e.id)}
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-linea text-carbon/40 transition hover:border-red-300 hover:text-red-500"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
  );
};

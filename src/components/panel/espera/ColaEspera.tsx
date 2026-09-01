"use client";

import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { minsAgo } from "@/lib/espera/slots";
import { waitlistClosed, waitlistStatusLabel } from "@/lib/types";
import type { WaitlistView } from "@/lib/types";

/* La lista de espera de la sala.
 *
 * Movida desde espera/page.tsx sin cambiar clases ni condiciones. La única
 * diferencia es que los setState que había en cada onClick pasaron a
 * callbacks: qué modal se abre al tocar "Sentar" es decisión de la pantalla,
 * no de la lista.
 *
 * `puedeSentar` sigue viniendo de arriba porque depende del estado de las
 * mesas, que esta lista no conoce ni tiene por qué conocer.
 */
const BTN_MOBILE =
  "w-full rounded-full px-4 py-3.5 text-sm font-semibold transition active:scale-[0.98] sm:w-auto sm:px-4 sm:py-2.5";

interface Props {
  cola: WaitlistView[];
  paginated: WaitlistView[];
  page: number;
  pageSize: number;
  ready: boolean;
  locale: string;
  puedeSentar: (personas: number) => boolean;
  onPage: (p: number) => void;
  onAgregar: () => void;
  onAvisar: (id: string) => void;
  onReavisar: (id: string) => void;
  onSentar: (id: string) => void;
  onVerQr: (espera: WaitlistView) => void;
  onCancelar: (id: string) => void;
}

export const ColaEspera = ({
  cola,
  paginated,
  page,
  pageSize,
  ready,
  locale,
  puedeSentar,
  onPage,
  onAgregar,
  onAvisar,
  onReavisar,
  onSentar,
  onVerQr,
  onCancelar,
}: Props) => {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-carbon/70">
          {locale === "en" ? "Waiting list" : "Lista de espera"}
          {cola.length ? ` · ${cola.length}` : ""}
        </h2>
        {cola.length > 0 && (
          <button
            type="button"
            onClick={onAgregar}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-espera px-4 text-sm font-semibold text-crema shadow-sm transition hover:bg-espera-fuerte sm:min-h-0 sm:py-2"
          >
            {locale === "en" ? "+ Add party" : "+ Agregar grupo"}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {paginated.map((e, idx) => {
          const mins = minsAgo(e.createdAt);
          const urgencia =
            mins >= 20 ? "text-alerta" : mins >= 10 ? "text-curso" : "";
          const pos = (page - 1) * pageSize + idx + 1;
          const sentable = puedeSentar(e.partySize);
          return (
          <article
            key={e.id}
            className={`rounded-[20px] border bg-surface p-4 shadow-sm ${
              e.status === "avisado"
                ? "border-espera/50 bg-espera/5 ring-1 ring-espera/25"
                : "border-linea"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-carbon/10 text-xs font-bold text-carbon/60">
                    {pos}
                  </span>
                  <h3 className="font-display text-xl uppercase tracking-tight text-carbon">
                    {e.name}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      e.status === "avisado"
                        ? "bg-espera text-crema"
                        : "bg-curso-fondo text-curso"
                    }`}
                  >
                    {waitlistStatusLabel(e.status, locale === "en" ? "en" : "es")}
                  </span>
                </div>
                <p className={`mt-1 text-sm text-carbon/55 ${urgencia}`}>
                  {e.partySize} {locale === "en" ? "guests" : "personas"} ·{" "}
                  <span className="font-semibold">{mins} min</span>
                  {e.employee ? ` · ${e.employee}` : ""}
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[9.5rem] sm:flex-row sm:flex-wrap">
                {e.status === "esperando" && (
                  <button
                    type="button"
                    onClick={() => onAvisar(e.id)}
                    className={`${BTN_MOBILE} bg-espera text-crema hover:bg-espera-fuerte sm:flex-1`}
                  >
                    {locale === "en" ? "Notify" : "Avisar"}
                  </button>
                )}
                {e.status === "avisado" && (
                  <button
                    type="button"
                    onClick={() => onReavisar(e.id)}
                    className={`${BTN_MOBILE} border border-espera/40 bg-espera/10 text-espera hover:bg-espera hover:text-crema sm:flex-1`}
                  >
                    {locale === "en" ? "Notify again 🔔" : "Volver a avisar 🔔"}
                  </button>
                )}
                {(e.status === "esperando" || e.status === "avisado") && (
                  <button
                    type="button"
                    onClick={() => onSentar(e.id)}
                    disabled={!sentable}
                    className={`${BTN_MOBILE} bg-carbon text-crema hover:opacity-90 disabled:opacity-40 sm:flex-1`}
                  >
                    {locale === "en" ? "Seat" : "Sentar"}
                  </button>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onVerQr(e);
                    }}
                    className={`${BTN_MOBILE} flex-1 border border-linea text-carbon/70 hover:bg-crema`}
                  >
                    QR
                  </button>
                  {!waitlistClosed(e.status) && (
                    <button
                      type="button"
                      onClick={() => onCancelar(e.id)}
                      className={`${BTN_MOBILE} flex-1 text-alerta hover:bg-alerta-fondo`}
                    >
                      {locale === "en" ? "Cancel" : "Cancelar"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </article>
          );
        })}
        {!ready && (
          <>
            <Skeleton className="h-[104px] rounded-[20px]" />
            <Skeleton className="h-[104px] rounded-[20px]" />
          </>
        )}
        {ready && !cola.length && (
          <div className="rounded-[24px] border border-dashed border-espera/30 bg-espera/5 px-6 py-10 text-center">
            <p className="font-display text-lg uppercase text-espera">
              {locale === "en" ? "No one waiting" : "Nadie en espera"}
            </p>
            <p className="mt-1 text-sm text-carbon/50">
              {locale === "en"
                ? "Add a party when walk-ins arrive."
                : "Agregá un grupo cuando lleguen sin reserva."}
            </p>
            <button
              type="button"
              onClick={onAgregar}
              className="mt-5 inline-flex min-h-11 w-full max-w-xs items-center justify-center rounded-full bg-espera px-5 text-sm font-semibold text-crema shadow-sm transition hover:bg-espera-fuerte sm:w-auto"
            >
              {locale === "en" ? "+ Add party" : "+ Agregar grupo"}
            </button>
          </div>
        )}
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={cola.length}
        onChange={onPage}
      />
    </section>
  );
};

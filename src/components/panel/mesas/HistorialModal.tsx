"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { formatMoney, type TableBill } from "@/lib/tableBill";
import { buscarHistorial, historialDelDia } from "@/lib/tableOps";

/* El día que ya pasó, para poder revisarlo.
 *
 * Antes esto era una lista al pie de la pantalla de cobros: se desplegaba
 * abajo de todo y desaparecía justo la noche en que hay treinta mesas, que es
 * la única en la que alguien necesita revisar algo. Y cada fila decía "Mesa 2
 * · $21.000", cuatro veces, sin nada que las separara.
 *
 * Arriba y en un cartel propio: la lista scrollea sin empujar la operación, y
 * cada fila trae lo que distingue una mesa de otra cuando los comensales ya se
 * fueron — la hora, quiénes eran, con qué pagaron.
 *
 * No consulta nada: son las mismas cuentas que la pantalla ya tiene cargadas.
 */
export const HistorialModal = ({
  bills,
  waiterFor,
  onSelect,
  onClose,
}: {
  bills: TableBill[];
  /* El mozo del turno, que la pantalla ya resolvió por número de mesa. */
  waiterFor?: (tableNumber: number) => string | null;
  onSelect: (sessionId: string) => void;
  onClose: () => void;
}) => {
  const { t } = useApp();
  const [q, setQ] = useState("");
  const filas = useMemo(() => historialDelDia(bills), [bills]);
  const visibles = useMemo(() => buscarHistorial(filas, q), [filas, q]);
  const cobrado = filas
    .filter((f) => f.estado === "pagada")
    .reduce((s, f) => s + f.cobrado, 0);
  const sinCobrar = filas.filter((f) => f.estado === "sin-cobrar").length;

  return (
    <ModalShell onClose={onClose} labelledBy="historial-title" wide>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="historial-title"
            className="font-display text-2xl uppercase tracking-tight text-carbon"
          >
            {t("mesas.historialTitulo")}
          </h2>
          <p className="mt-0.5 text-sm text-carbon/60">
            {t("mesas.historialResumen", {
              n: filas.length,
              total: formatMoney(cobrado),
            })}
            {sinCobrar > 0 ? ` · ${t("mesas.historialSinCobrarN", { n: sinCobrar })}` : ""}
          </p>
        </div>
        <ModalCloseBtn onClick={onClose} label={t("mesa.cerrar")} />
      </div>

      {filas.length > 6 && (
        <label className="mt-4 block">
          <span className="sr-only">{t("mesas.historialBuscar")}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("mesas.historialBuscar")}
            className="min-h-11 w-full rounded-2xl border border-linea bg-crema/40 px-4 text-sm text-carbon outline-none placeholder:text-carbon/40 focus:border-marca focus:ring-2 focus:ring-marca/20"
          />
        </label>
      )}

      {!visibles.length ? (
        <p className="mt-6 text-center text-sm text-carbon/55">
          {filas.length ? t("mesas.sinResultados") : t("mesas.historialVacio")}
        </p>
      ) : (
        /* Scroll y no paginado: es un servicio, no un archivo histórico —
           entran decenas de filas, y paginar sería un clic por cada diez. */
        <ul className="u-scroll mt-4 flex max-h-[55vh] flex-col gap-2 overflow-y-auto overscroll-contain pr-0.5">
          {visibles.map((f) => {
            const mozo = waiterFor?.(f.bill.session.tableNumber);
            const pagada = f.estado === "pagada";
            return (
              <li key={f.bill.session.id}>
                <button
                  type="button"
                  onClick={() => onSelect(f.bill.session.id)}
                  className="flex w-full flex-col gap-1.5 rounded-2xl border border-linea bg-surface p-3 text-left transition hover:border-carbon/25"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="flex items-baseline gap-2">
                      <span className="font-display text-xl leading-none text-carbon">
                        {t("mesa.mesaN", { n: f.bill.session.tableNumber })}
                      </span>
                      <span className="text-xs tabular-nums text-carbon/55">
                        {new Date(f.at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                    <span
                      className={`font-display text-lg tabular-nums leading-none ${
                        pagada ? "text-carbon" : "text-carbon/45"
                      }`}
                    >
                      {formatMoney(pagada ? f.cobrado : f.consumo)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-carbon/60">
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${
                        pagada ? "bg-ok-fondo text-ok" : "bg-carbon/10 text-carbon/70"
                      }`}
                    >
                      {t(`mesas.historialEstado.${f.estado}`)}
                    </span>
                    {mozo ? <span>{mozo}</span> : null}
                    {f.metodos.length ? (
                      <span>
                        {f.metodos.map((m) => t(`mesa.metodo.${m}`)).join(" · ")}
                      </span>
                    ) : null}
                    {f.bill.guests.length > 0 ? (
                      <span className="truncate">
                        {f.bill.guests.map((g) => g.name).join(", ")}
                      </span>
                    ) : null}
                  </span>
                  {!pagada && f.bill.session.closeReason ? (
                    <span className="text-xs italic text-carbon/50">
                      {f.bill.session.closeReason}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ModalShell>
  );
};

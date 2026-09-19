"use client";

import { useApp } from "@/components/providers/Providers";
import { formatMoney } from "@/lib/tableBill";
import type { CierreRow } from "@/lib/historial";

/* Las mesas que ya terminaron, una por fila.
 *
 * Cada fila trae lo que distingue una mesa de otra cuando los comensales ya se
 * fueron: la fecha y hora, con qué pagaron y quiénes eran. Sin eso, la lista
 * decía "Mesa 2 · $21.000" cuatro veces y no servía para revisar nada.
 *
 * La que se cerró sin cobrar muestra el consumo en gris y el motivo que quedó
 * registrado: el $0 de antes no contaba la historia.
 *
 * La fila no trae la cuenta: eso se pide recién cuando alguien la abre, y
 * mientras llega el botón queda marcado para que el toque no parezca perdido. */
export const HistorialLista = ({
  filas,
  abriendo,
  onSelect,
}: {
  filas: CierreRow[];
  /* La sesión cuyo detalle se está trayendo, si hay alguna. */
  abriendo?: string | null;
  onSelect: (sessionId: string) => void;
}) => {
  const { t } = useApp();
  return (
    <ul className="flex flex-col gap-2">
      {filas.map((f) => {
        const pagada = f.estado === "pagada";
        const cargando = abriendo === f.id;
        return (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => onSelect(f.id)}
              aria-busy={cargando}
              className={`flex w-full flex-col gap-1.5 rounded-2xl border bg-surface p-3 text-left transition sm:p-4 ${
                cargando
                  ? "border-pagos"
                  : "border-linea hover:border-carbon/25"
              }`}
            >
              <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="flex items-baseline gap-2">
                  <span className="font-display text-xl leading-none text-carbon">
                    {t("mesa.mesaN", { n: f.tableNumber })}
                  </span>
                  {/* Con varios días en la misma lista, la hora sola no ubica:
                      hace falta el día para saber de qué servicio se habla. */}
                  <span className="text-xs tabular-nums text-carbon/55">
                    {new Date(f.at).toLocaleString([], {
                      day: "2-digit",
                      month: "2-digit",
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
                {f.metodos.length ? (
                  <span>{f.metodos.map((m) => t(`mesa.metodo.${m}`)).join(" · ")}</span>
                ) : null}
                {f.comensales.length > 0 ? (
                  <span className="truncate">{f.comensales.join(", ")}</span>
                ) : null}
              </span>
              {!pagada && f.motivo ? (
                <span className="text-xs italic text-carbon/50">{f.motivo}</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

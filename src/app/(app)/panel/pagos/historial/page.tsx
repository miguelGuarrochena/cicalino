"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore } from "@/lib/store/session-store";
import { useConfigStore } from "@/lib/store/config-store";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { SubPageHeader } from "@/components/panel/SubPageHeader";
import { HistorialLista } from "@/components/panel/mesas/HistorialLista";
import { TableDetail } from "@/components/panel/mesas/TableDetail";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { MascotLoader } from "@/components/ui/MascotLoader";
import { SyncErrorBanner } from "@/components/panel/SyncErrorBanner";
import { fetchPaymentSettings, fetchTableBill, fetchTableClosings } from "@/lib/data/tables";
import { DEFAULT_PAYMENT_SETTINGS, type PaymentSettings, type TableBill } from "@/lib/tableBill";
import { PAGINA_HISTORIAL, rangoDe, type CierreRow, type RangoPreset } from "@/lib/historial";
import type { DataError } from "@/lib/data/result";

type Estado = "todas" | "pagada" | "sin-cobrar";

const PRESETS: RangoPreset[] = ["hoy", "ayer", "7d", "mes"];

/* El día que ya pasó, y los anteriores.
 *
 * Los datos siempre estuvieron: nada borra las mesas, los pedidos ni los
 * pagos. Lo que no existía era una puerta — `mesas_cuentas` corta en el inicio
 * de la jornada, así que una mesa cerrada ayer estaba en la base y no había
 * forma de encontrarla. Esta pantalla usa su propia consulta (`mesas_cierres`)
 * con el rango, el filtro, la búsqueda y la paginación resueltos en el
 * servidor, y pide el detalle completo recién cuando alguien abre una mesa.
 *
 * Se mantiene lejos de `useTableBills` a propósito: ese es el camino de la
 * operación, se refresca por realtime ante cualquier cambio del salón y trae
 * la cuenta entera de cada mesa. Meses de historia por ahí serían meses de
 * datos recargados cada vez que alguien llama al mozo. */
const HistorialPage = () => {
  const { t } = useApp();
  const branchId = useSessionStore((s) => s.sucursalId);
  const { visibles, canManage, ready: branchReady } = useOperationalAccess();
  const branchName = useConfigStore((s) => s.name);
  const cutoffHour = useConfigStore((s) => s.cutoffHour);

  const [preset, setPreset] = useState<RangoPreset>("7d");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState<Estado>("todas");
  const [q, setQ] = useState("");
  /* Lo que se escribió vs. lo que se fue a buscar. Antes la búsqueda era en
   * memoria y filtrar por tecla salía gratis; ahora cada letra es una consulta
   * al servidor, así que se espera a que la mano pare. */
  const [qBuscado, setQBuscado] = useState("");
  const [pagina, setPagina] = useState(0);

  const [filas, setFilas] = useState<CierreRow[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<DataError | null>(null);

  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [detalle, setDetalle] = useState<TableBill | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!branchId || !visibles.pagos) return;
    setCargando(true);
    const rango = rangoDe(preset, cutoffHour, { desde, hasta });
    const res = await fetchTableClosings(branchId, {
      ...rango,
      estado,
      busqueda: qBuscado,
      limite: PAGINA_HISTORIAL,
      offset: pagina * PAGINA_HISTORIAL,
    });
    if (res.ok) {
      setFilas(res.data.items);
      setTotal(res.data.total);
      setError(null);
    } else {
      setError(res.error);
    }
    setCargando(false);
  }, [branchId, visibles.pagos, preset, cutoffHour, desde, hasta, estado, qBuscado, pagina]);

  useEffect(() => {
    const id = setTimeout(() => {
      setQBuscado(q);
      setPagina(0);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- el setState
       ocurre después del await, no en el cuerpo del efecto. */
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!branchId || !visibles.pagos) return;
    let alive = true;
    void fetchPaymentSettings(branchId).then((r) => {
      if (alive && r.ok) setSettings(r.data.settings);
    });
    return () => {
      alive = false;
    };
  }, [branchId, visibles.pagos]);

  /* Cambiar de período, de estado o de búsqueda arranca de nuevo en la página
   * uno: quedarse en la cinco de un filtro que ya no existe muestra vacío. */
  const cambiar = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPagina(0);
  };

  const abrir = async (id: string) => {
    if (detalle?.session.id === id) return;
    setAbriendo(id);
    const bill = await fetchTableBill(id);
    setAbriendo(null);
    if (bill) setDetalle(bill);
  };

  if (!branchReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }
  if (!visibles.pagos) return null;

  const paginas = Math.max(1, Math.ceil(total / PAGINA_HISTORIAL));
  const filtrando = Boolean(qBuscado) || estado !== "todas";
  /* Misma regla que Comanda y Cobrar: en desktop la lista no se va; el
   * detalle entra a la derecha. En el teléfono no caben las dos, así que
   * la lista se esconde hasta que tocan volver. */
  const showDetail = Boolean(detalle);

  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader
        volverA="/panel/pagos"
        volverLabel={t("nav.pagos")}
        titulo={t("mesas.historialTitulo")}
        sub={total ? t("mesas.historialTotalN", { n: total }) : undefined}
      />

      <SyncErrorBanner error={error} />

      <div
        className={`grid gap-4 ${
          showDetail ? "lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]" : ""
        }`}
      >
        <div
          className={`flex min-w-0 flex-col gap-4 print:hidden ${
            showDetail ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={preset === p}
                onClick={() => cambiar(setPreset)(p)}
                className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition ${
                  preset === p
                    ? "border-pagos bg-pagos text-crema"
                    : "border-linea bg-surface text-carbon/70 hover:border-carbon/25 hover:text-carbon"
                }`}
              >
                {t(`mesas.rango.${p}`)}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={preset === "personalizado"}
              onClick={() => cambiar(setPreset)("personalizado")}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition ${
                preset === "personalizado"
                  ? "border-pagos bg-pagos text-crema"
                  : "border-linea bg-surface text-carbon/70 hover:border-carbon/25 hover:text-carbon"
              }`}
            >
              {t("mesas.rango.personalizado")}
            </button>
          </div>

          {preset === "personalizado" && (
            <div className="flex flex-wrap items-end gap-3">
              {(
                [
                  ["desde", desde, setDesde],
                  ["hasta", hasta, setHasta],
                ] as const
              ).map(([k, v, set]) => (
                <label key={k} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-carbon/50">
                    {t(`mesas.rango.${k}`)}
                  </span>
                  <input
                    type="date"
                    value={v}
                    onChange={(e) => cambiar(set)(e.target.value)}
                    className="min-h-11 rounded-2xl border border-linea bg-surface px-4 text-sm text-carbon outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
                  />
                </label>
              ))}
            </div>
          )}

          <SegmentedTabs
            ariaLabel={t("mesas.historialFiltro")}
            accent="pagos"
            value={estado}
            onChange={cambiar(setEstado)}
            options={[
              { id: "todas", label: t("mesas.filtroTodasCierres") },
              { id: "pagada", label: t("mesas.historialEstado.pagada") },
              { id: "sin-cobrar", label: t("mesas.historialEstado.sin-cobrar") },
            ]}
          />

          <label className="block">
            <span className="sr-only">{t("mesas.historialBuscar")}</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("mesas.historialBuscar")}
              className="min-h-11 w-full max-w-sm rounded-2xl border border-linea bg-surface px-4 text-sm text-carbon outline-none placeholder:text-carbon/40 focus:border-marca focus:ring-2 focus:ring-marca/20"
            />
          </label>

          {cargando ? (
            <div className="flex min-h-[30vh] items-center justify-center">
              <MascotLoader className="h-16" />
            </div>
          ) : filas.length ? (
            <>
              <HistorialLista
                filas={filas}
                abriendo={abriendo}
                seleccionada={detalle?.session.id ?? null}
                onSelect={(id) => void abrir(id)}
              />
              {paginas > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={pagina === 0}
                    onClick={() => setPagina((p) => Math.max(0, p - 1))}
                    className="min-h-11 rounded-full border border-linea bg-surface px-4 text-sm font-semibold text-carbon/70 disabled:opacity-40"
                  >
                    {t("paginacion.prev")}
                  </button>
                  <span className="text-sm tabular-nums text-carbon/60">
                    {t("paginacion.rango", {
                      from: pagina * PAGINA_HISTORIAL + 1,
                      to: pagina * PAGINA_HISTORIAL + filas.length,
                      total,
                    })}
                  </span>
                  <button
                    type="button"
                    disabled={pagina + 1 >= paginas}
                    onClick={() => setPagina((p) => p + 1)}
                    className="min-h-11 rounded-full border border-linea bg-surface px-4 text-sm font-semibold text-carbon/70 disabled:opacity-40"
                  >
                    {t("paginacion.next")}
                  </button>
                </div>
              )}
            </>
          ) : (
            /* La explicación se queda con o sin resultados: un título solo no
               dice qué período se miró ni qué probar. */
            <EmptyState
              title={filtrando ? t("mesas.sinResultados") : t("mesas.historialVacio")}
              body={
                filtrando
                  ? t("mesas.historialSinResultadosBody")
                  : t("mesas.historialVacioBody")
              }
            />
          )}
        </div>

        <div className={showDetail ? "block" : "hidden"}>
          {detalle ? (
            <TableDetail
              key={detalle.session.id}
              bill={detalle}
              settings={settings}
              branchName={branchName}
              employeeId={null}
              canManage={canManage}
              soloLectura
              onChanged={() => {}}
              onBack={() => setDetalle(null)}
              onBackLabel={t("mesas.historialTitulo")}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default HistorialPage;

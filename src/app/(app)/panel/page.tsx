"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOrdersStore } from "@/lib/store/orders-store";
import { OrderCard } from "@/components/panel/OrderCard";
import { QrModal } from "@/components/panel/QrModal";
import { ThemedImg } from "@/components/ui/ThemedImg";
import { ModalShell } from "@/components/ui/ModalShell";
import { useApp } from "@/components/providers/Providers";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import {
  useSuperadminStore,
  branchById,
} from "@/lib/store/superadmin-store";
import { Pagination, slicePage } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { dingNuevo, notifyReady } from "@/lib/sound";
import type { OrderStatus, OrderView } from "@/lib/types";
import { orderClosed } from "@/lib/types";

const ORDEN: Record<OrderStatus, number> = {
  listo: 0,
  creado: 1,
  en_preparacion: 1,
  retirado: 2,
  cancelado: 3,
};

const PAGE_SIZE = 9;

// Filtros de UI (estados operativos + cancelado).
type FiltroEstado = "todos" | "creado" | "listo" | "retirado" | "cancelado";

const FILTROS: FiltroEstado[] = [
  "todos",
  "creado",
  "listo",
  "retirado",
  "cancelado",
];

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 placeholder:text-carbon/40";

const matchFiltro = (status: OrderStatus, filtro: FiltroEstado): boolean => {
  if (filtro === "todos") return true;
  if (filtro === "creado") {
    return status === "creado" || status === "en_preparacion";
  }
  return status === filtro;
};

const PanelOrdersPage = () => {
  const { t } = useApp();
  const toast = useToast();
  const mode = useConfigStore((s) => s.modo);
  const tableCount = useConfigStore((s) => s.cantidadMesas);
  const activeEmployee = useSessionStore((s) => s.empleadoActivo);
  const branchId = useSessionStore((s) => s.sucursalId);
  const orgs = useSuperadminStore((s) => s.organizaciones);
  const branchNameLabel = branchById(orgs, branchId)?.nombre;
  const { pedidos: orders, seedSiVacio, cambiarEstado: changeStatus, agregarPedido: addOrder } =
    useOrdersStore();

  const [contador, setContador] = useState(43);
  const [qrOrder, setQrOrder] = useState<OrderView | null>(null);
  const [page, setPage] = useState(1);
  const [filtro, setFiltro] = useState<FiltroEstado>("todos");
  const [q, setQ] = useState("");
  const [createOpen, setCrearOpen] = useState(false);
  const [refDraft, setRefDraft] = useState("");
  const [refError, setRefError] = useState(false);

  useEffect(() => {
    seedSiVacio();
  }, [seedSiVacio]);

  useEffect(() => {
    setPage(1);
  }, [filtro, q]);

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders
      .filter((p) => matchFiltro(p.estado, filtro))
      .filter((p) =>
        needle ? p.referencia.toLowerCase().includes(needle) : true,
      )
      .sort((a, b) => {
        if (a.estado === b.estado) return 0;
        return ORDEN[a.estado] - ORDEN[b.estado];
      });
  }, [orders, filtro, q]);

  const activeItems = orders.filter((p) => !orderClosed(p.estado));
  const enCurso = activeItems.filter(
    (p) => p.estado === "creado" || p.estado === "en_preparacion",
  ).length;
  const listos = activeItems.filter((p) => p.estado === "listo").length;
  const pageItems = slicePage(filtrados, page, PAGE_SIZE);

  const buscarPh =
    mode === "mesa"
      ? t("panel.buscarMesa")
      : mode === "nombre"
        ? t("panel.buscarNombre")
        : t("panel.buscarPedido");

  const abrirNuevo = () => {
        if (mode === "pedido") {
          createOrder(String(contador));
          setContador((c) => c + 1);
          return;
        }
        setRefDraft("");
        setRefError(false);
        setCrearOpen(true);
      };

  const createOrder = (reference: string) => {
        const nuevo: OrderView = {
          id: crypto.randomUUID(),
          referencia: reference,
          estado: "creado",
          creadoEn: new Date().toISOString(),
          enPreparacionEn: null,
          listoEn: null,
          retiradoEn: null,
          canceladoEn: null,
          qrToken: crypto.randomUUID(),
          empleado: activeEmployee?.nombre ?? null,
        };
        addOrder(nuevo);
        setQrOrder(nuevo);
        setFiltro("todos");
        setQ("");
        dingNuevo();
        toast(t("toast.creado", { n: reference }), "success");
      };

  const changeStatusUX = (id: string, status: OrderStatus) => {
        changeStatus(id, status);
        if (status === "listo") {
          notifyReady();
          toast(t("toast.listo"), "success");
        } else if (status === "retirado") {
          toast(t("toast.retirado"), "info");
        } else if (status === "cancelado") {
          toast(t("toast.cancelado"), "error");
        }
      };

  const confirmarCrear = () => {
        const valor = refDraft.trim();
        if (!valor) {
          setRefError(true);
          return;
        }
        if (mode === "mesa") {
          const n = parseInt(valor, 10);
          if (!n || n < 1 || n > tableCount) {
            setRefError(true);
            return;
          }
          createOrder(String(n));
        } else {
          createOrder(valor);
        }
        setCrearOpen(false);
      };

  const labelFiltro = (f: FiltroEstado) => {
        if (f === "todos") return t("panel.filtroTodos");
        return t(`estado.${f}`);
      };

  const countFiltro = (f: FiltroEstado) => {
        return orders.filter((p) => matchFiltro(p.estado, f)).length;
      };

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          {branchNameLabel && (
            <p className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-marca/70">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 21h18M6 21V8l6-4 6 4v13M10 21v-4h4v4" />
              </svg>
              {branchNameLabel}
            </p>
          )}
          <h1 className="font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
            {t("panel.titulo")}
          </h1>
          <p className="mt-1 text-sm text-carbon/55">
            {t("panel.activos", { n: activeItems.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={abrirNuevo}
          className="w-full rounded-full bg-marca px-5 py-3 text-sm font-semibold text-crema shadow-sm transition hover:bg-marca-fuerte active:scale-95 sm:w-auto"
        >
          + {t("panel.nuevo")}
        </button>
      </div>

      {/* Resumen rápido (tablet/celular del mostrador) */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setFiltro("todos")}
          className={`rounded-2xl border px-3 py-3 text-left transition ${
            filtro === "todos"
              ? "border-marca bg-marca/10"
              : "border-linea bg-surface hover:bg-carbon/5"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon/45">
            {t("panel.resumenActivos")}
          </p>
          <p className="mt-0.5 font-display text-2xl text-carbon">{activeItems.length}</p>
        </button>
        <button
          type="button"
          onClick={() => setFiltro("creado")}
          className={`rounded-2xl border px-3 py-3 text-left transition ${
            filtro === "creado"
              ? "border-amber-400 bg-amber-50 dark:bg-amber-500/10"
              : "border-linea bg-surface hover:bg-carbon/5"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700/80">
            {t("estado.creado")}
          </p>
          <p className="mt-0.5 font-display text-2xl text-amber-700">{enCurso}</p>
        </button>
        <button
          type="button"
          onClick={() => setFiltro("listo")}
          className={`rounded-2xl border px-3 py-3 text-left transition ${
            filtro === "listo"
              ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10"
              : "border-linea bg-surface hover:bg-carbon/5"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80">
            {t("estado.listo")}
          </p>
          <p className="mt-0.5 font-display text-2xl text-emerald-700">{listos}</p>
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {FILTROS.map((f) => {
            const active = filtro === f;
            const n = countFiltro(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
                  active
                    ? "bg-marca text-crema"
                    : "border border-linea bg-surface text-carbon/60 hover:bg-carbon/5"
                }`}
              >
                {labelFiltro(f)}
                <span
                  className={`ml-1.5 ${active ? "opacity-80" : "opacity-50"}`}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={buscarPh}
          className={INPUT}
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-[32px] border border-linea bg-surface/60 px-6 py-16 text-center">
          <div className="u-float">
            <ThemedImg name="bell" alt="" className="h-28" />
          </div>
          <div>
            <p className="font-display text-xl uppercase tracking-tight text-carbon">
              {q || filtro !== "todos"
                ? t("panel.vacioFiltro")
                : t("panel.vacioTitulo")}
            </p>
            <p className="mt-1 text-sm text-carbon/55">
              {q || filtro !== "todos"
                ? t("panel.vacioFiltroSub")
                : t("panel.vacioSub")}
            </p>
          </div>
          {!q && filtro === "todos" && (
            <button
              type="button"
              onClick={abrirNuevo}
              className="rounded-full bg-marca px-5 py-2.5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
            >
              + {t("panel.nuevo")}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((p, i) => (
              <OrderCard
                key={p.id}
                pedido={p}
                index={i}
                onCambiarEstado={changeStatusUX}
                onMostrarQr={setQrOrder}
              />
            ))}
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={filtrados.length}
            onChange={setPage}
          />
        </>
      )}

      <p className="text-center text-xs text-carbon/45">
        {t("panel.ayudaEstados")}{" "}
        <Link
          href="/faq"
          className="font-semibold text-marca underline-offset-2 hover:underline"
        >
          {t("nav.faq")}
        </Link>
      </p>

      {createOpen && (
        <ModalShell
          onClose={() => setCrearOpen(false)}
          labelledBy="nuevo-pedido"
        >
          <h3
            id="nuevo-pedido"
            className="font-display text-2xl uppercase tracking-tight text-carbon"
          >
            {t("panel.nuevo")}
          </h3>
          <p className="mt-1 text-sm text-carbon/55">
            {mode === "mesa" ? t("panel.pedirMesa") : t("panel.pedirNombre")}
          </p>
          <input
            autoFocus
            className={`${INPUT} mt-4 ${refError ? "border-red-400" : ""}`}
            value={refDraft}
            onChange={(e) => {
              setRefDraft(
                mode === "mesa"
                  ? e.target.value.replace(/\D/g, "").slice(0, 3)
                  : e.target.value,
              );
              setRefError(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && confirmarCrear()}
            placeholder={mode === "mesa" ? "12" : "Sofía"}
            inputMode={mode === "mesa" ? "numeric" : "text"}
          />
          {refError && (
            <p className="mt-2 text-xs text-red-500">
              {mode === "mesa"
                ? t("panel.errMesa", { n: tableCount })
                : t("panel.errNombre")}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setCrearOpen(false)}
              className="flex-1 rounded-full border border-linea px-4 py-3 text-sm font-semibold text-carbon"
            >
              {t("qr.cerrar")}
            </button>
            <button
              type="button"
              onClick={confirmarCrear}
              className="flex-1 rounded-full bg-marca px-4 py-3 text-sm font-semibold text-crema"
            >
              {t("panel.crearYQr")}
            </button>
          </div>
        </ModalShell>
      )}

      {qrOrder && (
        <QrModal
          referencia={qrOrder.referencia}
          token={qrOrder.qrToken}
          etiqueta={t(`modo.${mode}`)}
          onClose={() => setQrOrder(null)}
        />
      )}
    </div>
  );
};
export default PanelOrdersPage;

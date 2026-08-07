"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useOrders } from "@/lib/hooks/useOrders";
import { fetchOrderSeen } from "@/lib/data/orders";
import { notifyCustomer, type NotifyResult } from "@/lib/notify";
import { OrderCard } from "@/components/panel/OrderCard";
import { QrModal } from "@/components/panel/QrModal";
import { ModuleSwitcher } from "@/components/panel/ModuleSwitcher";
import { SyncErrorBanner } from "@/components/panel/SyncErrorBanner";
import { ThemedImg } from "@/components/ui/ThemedImg";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { HelpLink } from "@/components/panel/HelpLink";
import { useApp } from "@/components/providers/Providers";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import {
  useSuperadminStore,
  branchById,
} from "@/lib/store/superadmin-store";
import { Pagination } from "@/components/ui/Pagination";
import { useDebounced } from "@/lib/hooks/useDebounced";
import { useToast } from "@/components/ui/Toast";
import { dingNew, notifyReady } from "@/lib/sound";
import type { OrderStatus, OrderView } from "@/lib/types";

const PAGE_SIZE = 9;

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

const PanelOrdersPage = () => {
  const { t, locale } = useApp();
  const toast = useToast();
  const mode = useConfigStore((s) => s.modo);
  const tableCount = useConfigStore((s) => s.tableCount);
  const activeEmployee = useSessionStore((s) => s.empleadoActivo);
  const branchId = useSessionStore((s) => s.sucursalId);
  const orgs = useSuperadminStore((s) => s.organizaciones);
  const [filtro, setFiltro] = useState<FiltroEstado>("todos");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  /* La búsqueda va con retardo porque ahora consulta al servidor. Sin esto
   * cada tecla sería una consulta, y el mostrador escribe rápido. */
  const qDebounced = useDebounced(q, 300);

  const {
    orders,
    total,
    conteos,
    proximoNumero,
    createOrder,
    changeStatus,
    branchName: liveBranchName,
    live,
    syncError,
  } = useOrders(branchId, {
    filtro,
    busqueda: qDebounced,
    pagina: page,
    tam: PAGE_SIZE,
  });
  const branchNameLabel = live
    ? liveBranchName
    : branchById(orgs, branchId)?.name;

  const [qrOrder, setQrOrder] = useState<OrderView | null>(null);
  const [createOpen, setCrearOpen] = useState(false);
  const [refDraft, setRefDraft] = useState("");
  const [creating, setCreando] = useState(false);
  const [refError, setRefError] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [filtro, q]);

  /* Cerrar el QR cuando el cliente lo abre. `visto_en` llega por realtime
   * dentro del propio pedido, así que alcanza con mirar la lista. */
  useEffect(() => {
    if (!qrOrder) return;
    const fresh = orders.find((o) => o.id === qrOrder.id);
    if (fresh) {
      if (fresh.seenAt) setQrOrder(null);
      return;
    }
    /* No está en la página visible: se pregunta por ese pedido puntualmente.
     * Corre con cada recarga, o sea con cada evento de realtime, no en bucle. */
    let vivo = true;
    void fetchOrderSeen(qrOrder.id).then((visto) => {
      if (vivo && visto) setQrOrder(null);
    });
    return () => {
      vivo = false;
    };
  }, [orders, qrOrder]);

  /* `orders` ya viene filtrado, ordenado y recortado a la página. Los
   * contadores vienen aparte porque son sobre la jornada entera, no sobre lo
   * que se ve. */
  const pageItems = orders;
  const enCurso = conteos.creado;
  const listos = conteos.listo;
  const activos = enCurso + listos;
  const nextNumero = proximoNumero;

  const buscarPh =
    mode === "mesa"
      ? t("panel.buscarMesa")
      : mode === "nombre"
        ? t("panel.buscarNombre")
        : t("panel.buscarPedido");

  const toastAviso = useCallback(
    (r: NotifyResult | null) => {
      if (!r) return;
      if (!r.ok) {
        toast(
          locale === "en"
            ? "Couldn’t notify. Check the connection and try again."
            : "No se pudo avisar. Revisá la conexión y probá de nuevo.",
          "error",
        );
        return;
      }
      if (r.delivered > 0) {
        toast(locale === "en" ? "Notified 🔔" : "Avisado 🔔", "success");
        return;
      }
      toast(
        locale === "en"
          ? "Marked as ready, but their phone has no alerts on — call them out."
          : "Marcado como listo, pero el celular no tiene avisos activos: llamalo vos.",
        "info",
      );
    },
    [locale, toast],
  );

  const reavisar = async (id: string) => {
    toastAviso(await notifyCustomer({ orderId: id }));
  };

  const handleCreate = async (reference: string): Promise<boolean> => {
    const created = await createOrder(reference, activeEmployee);
    if (!created) {
      toast("No se pudo crear el pedido", "error");
      return false;
    }
    setQrOrder(created);
    setFiltro("todos");
    setQ("");
    dingNew();
    toast(t("toast.creado", { n: reference }), "success");
    return true;
  };

  const abrirNuevo = () => {
    if (mode === "pedido") {
      void (async () => {
        if (creating) return;
        setCreando(true);
        await handleCreate(String(nextNumero));
        setCreando(false);
      })();
      return;
    }
    setRefDraft("");
    setRefError(false);
    setCrearOpen(true);
  };

  const changeStatusUX = async (id: string, status: OrderStatus) => {
    const notified = await changeStatus(id, status);
    if (status === "listo") {
      notifyReady();
      if (live) toastAviso(notified);
      else toast(t("toast.listo"), "success");
    } else if (status === "retirado") {
      toast(t("toast.retirado"), "info");
    } else if (status === "cancelado") {
      toast(t("toast.cancelado"), "error");
    }
  };

  const confirmarCrear = async () => {
    if (creating) return;
    const valor = refDraft.trim();
    if (!valor) {
      setRefError(true);
      return;
    }
    let ref = valor;
    if (mode === "mesa") {
      const n = parseInt(valor, 10);
      if (!n || n < 1 || n > tableCount) {
        setRefError(true);
        return;
      }
      ref = String(n);
    }
    setCreando(true);
    const ok = await handleCreate(ref);
    setCreando(false);
    if (ok) setCrearOpen(false);
  };

  const labelFiltro = (f: FiltroEstado) => {
        if (f === "todos") return t("panel.filtroTodos");
        return t(`estado.${f}`);
      };

  const countFiltro = (f: FiltroEstado) => conteos[f];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <ModuleSwitcher />
      <SyncErrorBanner error={syncError} />
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
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
              {t("panel.titulo")}
            </h1>
            <HelpLink seccion="pedidos" />
          </div>
          <p className="mt-1 text-sm text-carbon/55">
            {t("panel.activos", { n: activos })}
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
          <p className="mt-0.5 font-display text-2xl text-carbon">{activos}</p>
        </button>
        <button
          type="button"
          onClick={() => setFiltro("creado")}
          className={`rounded-2xl border px-3 py-3 text-left transition ${
            filtro === "creado"
              ? "border-amber-400 bg-amber-100"
              : "border-linea bg-surface hover:bg-carbon/5"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900">
            {t("estado.creado")}
          </p>
          <p className="mt-0.5 font-display text-2xl text-amber-900">{enCurso}</p>
        </button>
        <button
          type="button"
          onClick={() => setFiltro("listo")}
          className={`rounded-2xl border px-3 py-3 text-left transition ${
            filtro === "listo"
              ? "border-emerald-400 bg-emerald-100"
              : "border-linea bg-surface hover:bg-carbon/5"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
            {t("estado.listo")}
          </p>
          <p className="mt-0.5 font-display text-2xl text-emerald-900">{listos}</p>
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
                className={`flex min-h-11 shrink-0 items-center justify-center rounded-full px-4 text-sm font-semibold transition sm:min-h-0 sm:px-3.5 sm:py-2 ${
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

      {total === 0 ? (
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
                onReavisar={live ? reavisar : undefined}
              />
            ))}
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={setPage}
          />
        </>
      )}

      <p className="text-center text-xs text-carbon/45">
        {t("panel.ayudaEstados")}{" "}
        <Link
          href="/panel/ayuda#pedidos"
          className="font-semibold text-marca underline-offset-2 hover:underline"
        >
          {t("nav.ayuda")}
        </Link>
      </p>

      {createOpen && (
        <ModalShell
          onClose={() => {
            if (creating) return;
            if (refDraft.trim()) {
              if (
                !window.confirm(
                  locale === "en"
                    ? "Discard without creating the order?"
                    : "¿Salir sin crear el pedido?",
                )
              ) {
                return;
              }
            }
            setCrearOpen(false);
          }}
          labelledBy="nuevo-pedido"
          busy={creating}
          footer={
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={creating}
                onClick={() => void confirmarCrear()}
                className="w-full rounded-full bg-marca px-4 py-3 text-sm font-semibold text-crema disabled:opacity-60 sm:flex-1"
              >
                {creating ? "…" : t("panel.crearYQr")}
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={() => {
                  if (creating) return;
                  if (refDraft.trim()) {
                    if (
                      !window.confirm(
                        locale === "en"
                          ? "Discard without creating the order?"
                          : "¿Salir sin crear el pedido?",
                      )
                    ) {
                      return;
                    }
                  }
                  setCrearOpen(false);
                }}
                className="w-full rounded-full border border-linea bg-crema/60 px-4 py-3 text-sm font-semibold text-carbon disabled:opacity-50 sm:flex-1"
              >
                {locale === "en" ? "Cancel" : "Cancelar"}
              </button>
            </div>
          }
        >
          <div className="flex items-start justify-between gap-3">
            <h3
              id="nuevo-pedido"
              className="font-display text-2xl uppercase tracking-tight text-carbon"
            >
              {t("panel.nuevo")}
            </h3>
            <ModalCloseBtn
              disabled={creating}
              label={t("qr.cerrar")}
              onClick={() => {
                if (creating) return;
                if (refDraft.trim()) {
                  if (
                    !window.confirm(
                      locale === "en"
                        ? "Discard without creating the order?"
                        : "¿Salir sin crear el pedido?",
                    )
                  ) {
                    return;
                  }
                }
                setCrearOpen(false);
              }}
            />
          </div>
          <p className="mt-1 text-sm text-carbon/55">
            {mode === "mesa" ? t("panel.pedirMesa") : t("panel.pedirNombre")}
          </p>
          <input
            autoFocus
            disabled={creating}
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
            onKeyDown={(e) => e.key === "Enter" && void confirmarCrear()}
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
        </ModalShell>
      )}

      {qrOrder && (
        <QrModal
          reference={qrOrder.reference}
          token={qrOrder.qrToken}
          etiqueta={t(`modo.${mode}`)}
          onClose={() => setQrOrder(null)}
          onCancelar={() => {
            void changeStatusUX(qrOrder.id, "cancelado");
            setQrOrder(null);
          }}
        />
      )}
    </div>
  );
};
export default PanelOrdersPage;

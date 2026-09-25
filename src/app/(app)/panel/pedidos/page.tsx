"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useOrders } from "@/lib/hooks/useOrders";
import {
  findOpenOrderWithReference,
  fetchOrderSeenAt,
  isRealBranchId,
} from "@/lib/data/orders";
import { useQrSeenClose } from "@/lib/hooks/useQrSeenClose";
import { notifyCustomer } from "@/lib/notify";
import { OrderCard } from "@/components/panel/OrderCard";
import { QrModal } from "@/components/panel/QrModal";
import { SyncErrorBanner } from "@/components/panel/SyncErrorBanner";
import { JornadaInactivaState } from "@/components/panel/JornadaInactivaState";
import { ThemedImg } from "@/components/ui/ThemedImg";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { HelpLink } from "@/components/panel/HelpLink";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { TabGlyph, type TabGlyphKey } from "@/components/ui/TabGlyph";
import { useApp } from "@/components/providers/Providers";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useActiveEmployee } from "@/lib/hooks/useActiveEmployee";
import {
  useSuperadminStore,
  branchById,
} from "@/lib/store/superadmin-store";
import { Pagination } from "@/components/ui/Pagination";
import { OrderCardSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { useDebounced } from "@/lib/hooks/useDebounced";
import { useToast } from "@/components/ui/Toast";
import { useAvisoToast } from "@/lib/hooks/useAvisoToast";
import { dingNew, notifyReady } from "@/lib/sound";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { useJornadaActiva } from "@/lib/hooks/useJornadaActiva";
import { usePickupToCharge } from "@/lib/hooks/usePickupToCharge";
import {
  ChargeModal,
  PickupChargeInbox,
  useCounterChargeMethods,
} from "@/components/panel/pedidos/PickupChargeInbox";
import { formatMoney } from "@/lib/tableBill";
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

const FILTRO_ICON: Record<FiltroEstado, TabGlyphKey> = {
  todos: "todas",
  creado: "espera",
  listo: "listo",
  retirado: "retirado",
  cancelado: "cancelado",
};

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 placeholder:text-carbon/40";

const PanelOrdersPage = () => {
  const { t, locale } = useApp();
  const toast = useToast();
  const mode = useConfigStore((s) => s.modo);
  const tableCount = useConfigStore((s) => s.tableCount);
  /* Modalidad Mesa: además del tablero, la caja cobra lo que piden las mesas.
   * La modalidad de siempre no ve nada de esto. */
  const enMesa = useConfigStore((s) => s.pedidosModalidad === "mesa");
  /* Mostrador QR: los pedidos llegan del QR del local y se cobran al
   * retirar, desde la tarjeta del tablero. */
  const enMostradorQr = useConfigStore((s) => s.pedidosModalidad === "mostrador_qr");
  const { visibles } = useOperationalAccess();
  const jornadaActiva = useJornadaActiva();
  const activeEmployee = useActiveEmployee();
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
    createOrder,
    changeStatus,
    branchName: liveBranchName,
    ready,
    live,
    syncError,
  } = useOrders(jornadaActiva ? branchId : null, {
    filtro,
    busqueda: qDebounced,
    pagina: page,
    tam: PAGE_SIZE,
  });
  const branchNameLabel = live
    ? liveBranchName
    : branchById(orgs, branchId)?.name;

  const porCobrar = usePickupToCharge(
    jornadaActiva ? branchId : null,
    enMesa && visibles.pedidos,
  );

  const qr = useQrSeenClose<OrderView>(fetchOrderSeenAt, orders);
  const chargeMethods = useCounterChargeMethods(enMostradorQr ? branchId : null);
  const [charging, setCharging] = useState<OrderView | null>(null);
  const [createOpen, setCrearOpen] = useState(false);
  const [refDraft, setRefDraft] = useState("");
  const [creating, setCreando] = useState(false);
  /* El state `creating` llega tarde al segundo tap: React no re-renderiza
   * antes. El ref sí, en el mismo click. */
  const creatingRef = useRef(false);
  const [refError, setRefError] = useState(false);
  /* El identificador ya está en uso por un pedido abierto. Avisa y deja
   * seguir: el segundo toque del botón crea igual. Hay locales que repiten a
   * propósito y no les vamos a trabar el mostrador por eso. */
  const [refRepetida, setRefRepetida] = useState(false);

  /* Volver a la página 1 cuando cambia el filtro o la búsqueda.
   *
   * Se ajusta durante el render y no en un efecto: así el primer render con el
   * filtro nuevo ya sale con la página correcta, en vez de pintar la vieja y
   * corregirla en una segunda pasada. Es el patrón que documenta React para
   * "resetear estado cuando cambia otro". */
  const claveConsulta = `${filtro}|${q}`;
  const [claveAnterior, setClaveAnterior] = useState(claveConsulta);
  if (claveConsulta !== claveAnterior) {
    setClaveAnterior(claveConsulta);
    setPage(1);
  }

  /* Pedido vivo: el alias puede cambiar mientras el QR sigue abierto. */
  const qrLive = qr.itemVivo;

  /* `orders` ya viene filtrado, ordenado y recortado a la página. Los
   * contadores vienen aparte porque son sobre la jornada entera, no sobre lo
   * que se ve. */
  const pageItems = orders;
  const enCurso = conteos.creado;
  const listos = conteos.listo;
  const activos = enCurso + listos;

  const buscarPh =
    mode === "mesa"
      ? t("panel.buscarMesa")
      : mode === "nombre"
        ? t("panel.buscarNombre")
        : t("panel.buscarPedido");

  const toastAviso = useAvisoToast();
  const seenAtDe = (id: string) =>
    orders.find((o) => o.id === id)?.seenAt ?? null;

  const reavisar = async (id: string) => {
    const seenAt = seenAtDe(id);
    toastAviso(await notifyCustomer({ orderId: id }), seenAt);
  };

  const handleCreate = async (reference: string | null): Promise<boolean> => {
    const created = await createOrder(reference, activeEmployee);
    if (!created) {
      toast("No se pudo crear el pedido", "error");
      return false;
    }
    qr.abrirNuevo(created);
    setFiltro("todos");
    setQ("");
    dingNew();
    toast(t("toast.creado", { n: created.reference }), "success");
    return true;
  };

  const abrirNuevo = () => {
    if (mode === "pedido") {
      if (creatingRef.current) return;
      creatingRef.current = true;
      setCreando(true);
      /* null → RPC asigna el número bajo lock (evita race entre cajas). */
      void handleCreate(null).finally(() => {
        creatingRef.current = false;
        setCreando(false);
      });
      return;
    }
    setRefDraft("");
    setRefError(false);
    setRefRepetida(false);
    setCrearOpen(true);
  };

  const changeStatusUX = async (id: string, status: OrderStatus) => {
    const seenAt = seenAtDe(id);
    const res = await changeStatus(id, status);
    if (!res.ok) {
      toast(
        locale === "en"
          ? "Couldn’t update the order. Reload and try again."
          : "No se pudo actualizar el pedido. Recargá y probá de nuevo.",
        "error",
      );
      return;
    }
    if (status === "listo") {
      notifyReady();
      if (live) toastAviso(res.notify, seenAt);
      else toast(t("toast.listo"), "success");
    } else if (status === "retirado") {
      toast(t("toast.retirado"), "info");
    } else if (status === "cancelado") {
      toast(t("toast.cancelado"), "error");
    }
  };

  const confirmarCrear = async () => {
    if (creatingRef.current) return;
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
    creatingRef.current = true;
    setCreando(true);
    try {
      /* Solo en el modo identificador: repetir un número de mesa es normal,
       * repetir un identificador de pedido casi nunca lo es. Si la consulta
       * falla devuelve false y el alta sigue como siempre. */
      if (mode === "nombre" && !refRepetida && live && branchId) {
        const yaExiste = await findOpenOrderWithReference(branchId, ref);
        if (yaExiste) {
          setRefRepetida(true);
          return;
        }
      }
      const ok = await handleCreate(ref);
      if (ok) setCrearOpen(false);
    } finally {
      creatingRef.current = false;
      setCreando(false);
    }
  };

  const cerrarCrear = () => {
    if (creating) return;
    setCrearOpen(false);
    setRefDraft("");
    setRefError(false);
    setRefRepetida(false);
  };

  const labelFiltro = (f: FiltroEstado) => {
        if (f === "todos") return t("panel.filtroTodos");
        return t(`estado.${f}`);
      };

  const countFiltro = (f: FiltroEstado) => conteos[f];

  if (!visibles.pedidos) return null;

  if (!jornadaActiva) {
    return (
      <div className="flex flex-col gap-5 sm:gap-6">
        <div>
          {branchNameLabel && (
            <p className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-marca/70">
              {branchNameLabel}
            </p>
          )}
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
              {t("panel.titulo")}
            </h1>
            <HelpLink seccion="pedidos" />
          </div>
        </div>
        <JornadaInactivaState />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
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
          {(enMesa || enMostradorQr) && (
            <Link
              href="/panel/pedidos/qr"
              className="mt-1 inline-flex min-h-9 items-center text-sm font-semibold text-marca underline-offset-2 hover:underline"
            >
              {enMesa ? t("retiroCaja.qrMesas") : t("mostradorQr.panel.qrLink")}
            </Link>
          )}
          {ready ? (
            <p className="mt-1 text-sm text-carbon/55">
              {t("panel.activos", { n: activos })}
            </p>
          ) : (
            <Skeleton className="mt-1.5 h-4 w-28" />
          )}
        </div>
        <button
          type="button"
          onClick={abrirNuevo}
          disabled={creating}
          className="w-full rounded-full bg-marca px-5 py-3 text-sm font-semibold text-crema shadow-sm transition hover:bg-marca-fuerte active:scale-95 disabled:opacity-50 sm:w-auto"
        >
          {creating ? "…" : `+ ${t("panel.nuevo")}`}
        </button>
      </div>

      {enMesa && branchId && isRealBranchId(branchId) && (
        <PickupChargeInbox
          branchId={branchId}
          orders={porCobrar.orders}
          employeeId={activeEmployee?.id ?? null}
          onChanged={porCobrar.refresh}
        />
      )}

      <div className="flex flex-col gap-3">
        <SegmentedTabs
          ariaLabel={t("panel.titulo")}
          value={filtro}
          onChange={setFiltro}
          options={FILTROS.map((f) => ({
            id: f,
            label: labelFiltro(f),
            icon: <TabGlyph k={FILTRO_ICON[f]} />,
            badge: countFiltro(f),
          }))}
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={buscarPh}
          className={INPUT}
        />
      </div>

      {/* Hasta que vuelve la primera consulta no se sabe si la jornada está
          vacía. Antes se pintaba el cartel de "todavía no hay pedidos" y se
          reemplazaba por la lista un segundo después. */}
      {!ready ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </div>
      ) : total === 0 ? (
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
                onMostrarQr={qr.abrirVerQr}
                onReavisar={live ? reavisar : undefined}
                onCobrar={enMostradorQr && live ? setCharging : undefined}
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
          onClose={cerrarCrear}
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
                {creating
                  ? "…"
                  : refRepetida
                    ? t("panel.refRepetidaSeguir")
                    : t("panel.crearYQr")}
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={cerrarCrear}
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
              onClick={cerrarCrear}
            />
          </div>
          <p className="mt-1 text-sm font-medium text-carbon/70">
            {mode === "mesa" ? t("panel.pedirMesa") : t("panel.pedirNombre")}
          </p>
          {mode !== "mesa" && (
            <p className="mt-1 text-xs text-carbon/50">
              {t("panel.pedirNombreSub")}
            </p>
          )}
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
              setRefRepetida(false);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              void confirmarCrear();
            }}
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
          {refRepetida && !refError && (
            <p className="mt-2 text-xs font-medium text-curso">
              {t("panel.refRepetida")}
            </p>
          )}
        </ModalShell>
      )}

      {charging && (
        <ChargeModal
          order={{
            id: charging.id,
            reference: charging.reference,
            total: charging.total ?? 0,
          }}
          label={`${t("mostradorQr.panel.etiqueta")}${charging.alias ? ` · ${charging.alias}` : ""}`}
          mpInProgress={Boolean(charging.mpPending)}
          note={t("mostradorQr.panel.alCobrar")}
          methods={chargeMethods}
          employeeId={activeEmployee?.id ?? null}
          onClose={() => setCharging(null)}
          onDone={(repeated) => {
            toast(
              repeated
                ? t("retiroCaja.yaCobrado", { n: charging.reference })
                : t("mostradorQr.panel.cobrado", {
                    n: charging.reference,
                    total: formatMoney(charging.total ?? 0),
                  }),
              "success",
            );
            setCharging(null);
          }}
        />
      )}

      {qrLive && (
        <QrModal
          reference={qrLive.reference}
          alias={qrLive.alias}
          token={qrLive.qrToken}
          etiqueta={t(`modo.${mode}`)}
          onClose={qr.cerrar}
          onCancelar={() => {
            void changeStatusUX(qrLive.id, "cancelado");
            qr.cerrar();
          }}
        />
      )}
    </div>
  );
};
export default PanelOrdersPage;

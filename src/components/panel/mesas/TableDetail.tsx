"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import {
  ConsumptionTable,
  PaymentRows,
} from "@/components/tables/BillParts";
import { CobrarModal } from "@/components/panel/mesas/CobrarModal";
import { PrintableBill } from "@/components/panel/mesas/PrintableBill";
import { TableHistory } from "@/components/panel/mesas/TableHistory";
import { FloorStatusBadge } from "@/components/panel/mesas/FloorStatusBadge";
import { Select } from "@/components/ui/Select";
import { updateOrderStatus } from "@/lib/data/orders";
import { cancelTablePayment, confirmTablePayment, acknowledgeWaiterCall } from "@/lib/data/tables";
import {
  billPending,
  excessPayments,
  formatMoney,
  type BillOrder,
  type BillPayment,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";
import {
  floorStatus,
  guestAccountRows,
  kitchenOrders,
  summarizeKitchen,
} from "@/lib/tableOps";
import type { OrderStatus } from "@/lib/types";

export const TableDetail = ({
  bill,
  settings,
  branchName,
  employeeId,
  employeeName,
  canManage,
  soloLectura = false,
  onCloseTable,
  onChanged,
  onBack,
  onBackLabel,
  onShowQr,
  waiterName,
  waiterId,
  staff,
  onAssign,
}: {
  bill: TableBill;
  settings: PaymentSettings;
  branchName: string;
  employeeId: string | null;
  employeeName?: string | null;
  canManage: boolean;
  /* El historial es una consulta del pasado, no otra puerta de operación:
   * anular un pago de agosto descuadra un cierre de caja que ya pasó. Con
   * esto el detalle muestra lo mismo pero no ofrece nada que escriba. */
  soloLectura?: boolean;
  /* Lo abre la página: el modal de cerrar vive una sola vez, así la baldosa y
   * el detalle no tienen cada uno su copia. */
  onCloseTable?: () => void;
  onChanged: () => void;
  onBack?: () => void;
  /* Qué dice el botón de volver. Por defecto, "Mesas": el detalle se abre casi
   * siempre desde la grilla de Pagos. El historial lo pisa, porque desde ahí
   * volver a "Mesas" es volver a otro lado. */
  onBackLabel?: string;
  onShowQr?: () => void;
  waiterName?: string | null;
  waiterId?: string | null;
  staff?: { id: string; name: string }[];
  onAssign?: (employeeId: string | null) => Promise<{ ok: boolean; reason?: string }>;
}) => {
  const { t } = useApp();
  const toast = useToast();
  const confirmar = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [cobrarOpen, setCobrarOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState(waiterId ?? "");
  /* Todo lo que escribe cuelga de `open`: cobrar, confirmar, anular, anotar,
   * cancelar y cerrar. Por eso alcanza con apagarlo acá — una sesión que por
   * lo que sea siguiera abierta no convierte una consulta del pasado en una
   * pantalla de cobro. */
  const open = bill.session.status === "abierta" && !soloLectura;
  const live =
    (bill.session.status === "abierta" || bill.session.status === "pagada") &&
    !soloLectura;
  const names = new Map(bill.guests.map((g) => [g.id, g.name]));
  const pending = billPending(bill);
  const status = floorStatus(bill);
  const waitingPayments = bill.payments.filter(
    (p) => p.status === "pendiente" && p.method !== "mercado_pago",
  );
  const excess = excessPayments(bill);
  const created = kitchenOrders(bill, "creado");
  const comanda = bill.orders.filter((o) => o.status !== "cancelado");
  const accountRows = guestAccountRows(bill);

  const errorText = (reason?: string) => {
    for (const k of [`recepcion.error.${reason}`, `mesas.error.${reason}`, `mesa.error.${reason}`]) {
      const txt = t(k);
      if (txt !== k) return txt;
    }
    return t("mesas.error.error");
  };

  const run = async (id: string, fn: () => Promise<{ ok: boolean; reason?: string }>, okMsg: string) => {
    setBusy(id);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      toast(okMsg, "success");
      onChanged();
    } else {
      toast(errorText(res.reason), "error");
    }
  };

  /* La acción global del resumen: "ya cobré todo lo que estaba anotado".
   *
   * Confirma de una los pagos que el comensal dejó pendientes desde el
   * celular. No inventa un pago nuevo ni elige método por nadie: cada pago ya
   * trae el suyo. Lo que no está anotado se cobra con "Cobrar", que es otra
   * cosa y lo dice.
   *
   * Va de a uno y en orden: si el tercero falla, los dos primeros quedaron
   * confirmados de verdad y el error nombra lo que faltó. */
  const confirmarPendientes = async () => {
    setBusy("todos");
    let fallo: string | undefined;
    for (const p of waitingPayments) {
      const res = await confirmTablePayment(p.id, employeeId);
      if (!res.ok) {
        fallo = res.reason;
        break;
      }
    }
    setBusy(null);
    if (fallo) toast(errorText(fallo), "error");
    else toast(t("mesas.todosConfirmados"), "success");
    onChanged();
  };

  const moveOrder = (o: BillOrder, to: OrderStatus) =>
    run(
      o.id,
      async () => {
        const ok = await updateOrderStatus(o.id, to);
        return ok ? { ok } : { ok, reason: to === "cancelado" ? "pagos-exceden" : "error" };
      },
      t(`mesas.pedidoMovido.${to}`),
    );

  /* Los botones de un pago viven en un solo lugar según lo que sea el pago.
   *
   * Antes esto se renderizaba dos veces —en el aviso de arriba y otra vez en
   * la cuenta de abajo— así que el mismo pago de Juan tenía dos "Confirmar
   * pago" en la misma pantalla, más un tercero dentro del modal de cobrar.
   *
   * El reparto ahora es por estado, y no se pisan:
   *
   *  · pendiente → arriba, en el aviso, que es donde el mozo lo está mirando
   *    cuando entra a la mesa. Ahí confirma o cancela.
   *  · ya pagado → abajo, en la cuenta, que es el registro. Ahí el encargado
   *    puede anularlo.
   *  · Mercado Pago pendiente → abajo también, sin botón: se confirma solo.
   */
  const paymentActions = (p: BillPayment, soloRegistro = false) => {
    if (!live || p.status === "cancelado") return null;
    if (soloRegistro && p.status === "pendiente" && p.method !== "mercado_pago") {
      return null;
    }
    if (!soloRegistro && p.status !== "pendiente") return null;
    const canConfirm = open && p.status === "pendiente" && p.method !== "mercado_pago";
    const canCancel =
      (open && p.status === "pendiente") ||
      (canManage && p.status === "pagado" && p.method !== "mercado_pago");
    if (!canConfirm && !canCancel && !(p.status === "pendiente" && p.method === "mercado_pago")) {
      return null;
    }
    /* Las dos acciones entran en una fila si hay lugar y se apilan si no, sin
     * consultar el ancho en JS: `auto-fit` con un mínimo de 9rem por columna
     * hace las dos cuentas solo. En un teléfono de 375 px entran las dos; en
     * uno angosto, o con el detalle en una columna finita, se apilan.
     *
     * Las dos miden lo mismo al tacto (48 px, 44 en desktop donde se apunta
     * con el mouse). Lo que las diferencia es el peso visual, no el tamaño:
     * un "Cancelar" de letra chica se falla con el dedo, y fallar el botón de
     * cancelar un cobro en hora pico no es gratis. */
    return (
      <div className="mt-2 flex w-full flex-col gap-1.5 sm:mt-0">
        {canConfirm && (
          <button
            type="button"
            disabled={busy === p.id}
            onClick={() =>
              void run(
                p.id,
                () => confirmTablePayment(p.id, employeeId),
                t("mesas.pagoConfirmadoMesa", { n: t("mesa.mesaN", { n: bill.session.tableNumber }) }),
              )
            }
            className="flex min-h-12 items-center justify-center rounded-full bg-ok px-3 text-sm font-semibold leading-tight text-crema transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50 sm:min-h-11"
          >
            {p.method === "transferencia" ? t("mesas.confirmarRecibido") : t("mesas.confirmarPago")}
          </button>
        )}
        {p.status === "pendiente" && p.method === "mercado_pago" && (
          <span className="text-[11px] text-carbon/55">{t("mesas.mpSoloWebhook")}</span>
        )}
        {(canConfirm || canCancel) && (
        <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
        {canCancel && (
          <button
            type="button"
            disabled={busy === p.id}
            onClick={() => {
              void (async () => {
                /* Anular un pago ya cobrado pide motivo; cancelar uno que
                 * todavía está pendiente, solo confirmación. La regla es de
                 * `cancelar_pago_mesa` y no cambió: acá solo se pregunta. */
                let motivo: string | null = null;
                if (p.status === "pagado") {
                  motivo = await confirmar({
                    title: t("mesas.anularPagoTitulo"),
                    input: {
                      label: t("mesas.motivoAnular"),
                      requerido: true,
                      maxLength: 200,
                    },
                    confirmLabel: t("mesas.anularPagoSi"),
                    cancelLabel: t("acciones.volver"),
                    tone: "peligro",
                  });
                  if (!motivo) return;
                } else {
                  const ok = await confirmar({
                    title: t("mesas.cancelarPagoTitulo"),
                    body: t("mesas.cancelarPagoConfirmar"),
                    confirmLabel: t("mesas.cancelarPagoSi"),
                    cancelLabel: t("acciones.volver"),
                    tone: "peligro",
                  });
                  if (!ok) return;
                }
                await run(
                  p.id,
                  () => cancelTablePayment(p.id, motivo, employeeId),
                  t("mesas.pagoCancelado"),
                );
              })();
            }}
            className="flex min-h-12 items-center justify-center rounded-full border border-linea bg-surface px-3 text-sm font-semibold leading-tight text-carbon/70 transition hover:border-carbon/30 hover:text-carbon active:scale-[0.98] disabled:opacity-50 sm:min-h-11"
          >
            {p.status === "pagado" ? t("mesas.anularPago") : t("mesas.cancelarPago")}
          </button>
        )}
        </div>
        )}
      </div>
    );
  };

  return (
    <>
      <section className="rounded-[24px] border border-linea bg-surface p-4 shadow-sm sm:p-6 print:hidden">
        {/* En pantalla angosta el detalle tapa la lista, así que este botón es
            el único camino de vuelta. Era un "← Mesas" gris de 14 px: del
            mismo tamaño que cualquier texto de la pantalla, o sea una frase y
            no un botón. Misma píldora que usan las sub-pantallas de Pagos. */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-3 flex min-h-11 w-fit items-center gap-2 rounded-full border border-linea bg-crema px-4 text-sm font-semibold text-carbon/70 transition hover:border-carbon/25 hover:text-carbon lg:hidden"
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
            {onBackLabel ?? t("mesas.volverCobros")}
          </button>
        )}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl uppercase text-marca">
              {t("mesa.mesaN", { n: bill.session.tableNumber })}
            </h2>
            <p className="text-sm text-carbon/60">
              {waiterName
                ? t("recepcion.atendidaPor", { n: waiterName })
                : t("recepcion.sinAsignar")}
              {" · "}
              {t("mesas.abiertaDesde", {
                h: new Date(bill.session.openedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}{" "}
              · {t("mesas.comensalesN", { n: bill.guests.length })}
            </p>
          </div>
          <FloorStatusBadge status={status} />
        </header>

        {open && bill.session.calledAt && (
          <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-alerta/40 bg-alerta/10 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-alerta">{t("mesas.teLlaman")}</p>
            <button
              type="button"
              disabled={busy === "llamado"}
              onClick={() =>
                void run("llamado", () => acknowledgeWaiterCall(bill.session.id), t("mesas.llamadoAtendido"))
              }
              className="min-h-11 rounded-full bg-alerta px-5 text-sm font-semibold text-crema disabled:opacity-50"
            >
              {t("mesas.yaVoy")}
            </button>
          </div>
        )}

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["mesa.total", bill.totals.total, "text-carbon"],
              ["mesa.pagado", bill.totals.paid, "text-ok"],
              ["mesa.pendiente", pending, pending > 0 ? "text-alerta" : "text-carbon/50"],
            ] as const
          ).map(([k, v, cls]) => (
            <div key={k} className="rounded-2xl border border-linea bg-crema/40 px-2 py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-carbon/50">{t(k)}</dt>
              <dd className={`mt-0.5 font-display text-lg tabular-nums sm:text-2xl ${cls}`}>
                {formatMoney(v)}
              </dd>
            </div>
          ))}
        </dl>

        {open && waitingPayments.length > 0 && (
          <p className="mt-3 text-center text-sm font-semibold text-curso">
            {t("mesas.pagosEsperandoN", { n: waitingPayments.length })}
          </p>
        )}
        {excess.length > 0 && (
          <p className="mt-3 text-center text-sm font-semibold text-alerta">
            {t("mesas.evento.excedente")}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {/* Una sola acción global, y solo con dos o más esperando: con uno
              solo, el botón de esa persona ya es la acción global y dos
              botones para el mismo pago es justo lo que había que sacar. */}
          {open && waitingPayments.length > 1 && (
            <button
              type="button"
              disabled={busy === "todos"}
              onClick={() => void confirmarPendientes()}
              className="min-h-12 w-full rounded-full bg-ok px-6 text-base font-semibold text-crema transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            >
              {t("mesas.confirmarTodos", { n: waitingPayments.length })}
            </button>
          )}
          {/* Cobrar registra plata nueva. Con todo lo pendiente ya anotado no
              queda nada por registrar, y antes abría un modal que decía
              justamente eso: "todo reservado". */}
          {open && bill.totals.available > 0 && (
            <button
              type="button"
              onClick={() => setCobrarOpen(true)}
              className={`min-h-12 w-full rounded-full px-6 text-base font-semibold transition active:scale-[0.98] ${
                waitingPayments.length > 1
                  ? "border border-marca text-marca hover:bg-marca/5"
                  : "bg-marca text-crema hover:bg-marca-fuerte"
              }`}
            >
              {t("mesas.cobrar")} · {formatMoney(bill.totals.available)}
            </button>
          )}
          {onShowQr && (
            <button
              type="button"
              onClick={onShowQr}
              className="min-h-11 w-full rounded-full border border-marca px-6 text-sm font-semibold text-marca"
            >
              {t("mesas.verQrMesa")}
            </button>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {onAssign && canManage && (
              <button
                type="button"
                onClick={() => {
                  setReassignTo(waiterId ?? "");
                  setReassignOpen((v) => !v);
                }}
                className="min-h-11 text-sm font-semibold text-carbon/60 underline-offset-4 hover:text-carbon hover:underline"
              >
                {t("recepcion.reasignar")}
              </button>
            )}
            {onAssign && !canManage && !waiterId && employeeId && (
              <button
                type="button"
                disabled={busy === "tomar"}
                onClick={() =>
                  void run("tomar", () => onAssign(employeeId), t("recepcion.asignado"))
                }
                className="min-h-11 text-sm font-semibold text-marca underline-offset-4 hover:underline disabled:opacity-50"
              >
                {t("recepcion.tomar")}
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-11 text-sm font-semibold text-carbon/60 underline-offset-4 hover:text-carbon hover:underline"
            >
              {t("mesas.imprimirCuenta")}
            </button>
            {/* Visible siempre que la mesa esté abierta, también con saldo y
                también para el mozo. Esconderla no evitaba nada: dejaba la
                mesa abierta para siempre y sin pista de cómo cerrarla. Las
                reglas siguen donde estaban — el modal explica el saldo y pide
                el motivo, y `cerrar_mesa` rechaza pagos pendientes y exige
                encargado cuando falta cubrir. */}
            {live && onCloseTable && (
              <button
                type="button"
                onClick={onCloseTable}
                className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70 transition hover:border-carbon/30 hover:text-carbon"
              >
                {t("mesas.cerrarMesa")}
              </button>
            )}
          </div>
          {reassignOpen && onAssign && staff && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={reassignTo}
                onChange={setReassignTo}
                className="flex-1"
                triggerClassName="min-h-11"
                ariaLabel={t("recepcion.reasignar")}
                options={[
                  { value: "", label: t("recepcion.sinAsignar") },
                  ...staff.map((e) => ({ value: e.id, label: e.name })),
                ]}
              />
              <button
                type="button"
                disabled={busy === "reasignar"}
                onClick={() =>
                  void run(
                    "reasignar",
                    async () => {
                      const res = await onAssign(reassignTo || null);
                      if (res.ok) setReassignOpen(false);
                      return res;
                    },
                    t("recepcion.asignado"),
                  )
                }
                className="min-h-11 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
              >
                {t("recepcion.asignar")}
              </button>
            </div>
          )}
        </div>

        {waitingPayments.length > 0 && (
          <div className="mt-4 rounded-2xl border border-curso-borde bg-curso-fondo p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-curso">
              {waitingPayments.some((p) => p.createdBy === "comensal")
                ? t("mesas.cuentaSolicitada")
                : waitingPayments.length === 1
                  ? t("mesas.pagoElegido", {
                      m: t(`mesa.metodo.${waitingPayments[0]!.method}`),
                    })
                  : t("mesas.esperandoConfirmacion")}
            </p>
            {waitingPayments.some((p) => p.createdBy === "comensal") &&
            waitingPayments.length === 1 ? (
              <p className="mt-1 text-xs text-carbon/55">
                {t("mesas.pagoElegido", {
                  m: t(`mesa.metodo.${waitingPayments[0]!.method}`),
                })}
              </p>
            ) : null}
            <ul className="mt-2 flex flex-col gap-3">
              {waitingPayments.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 border-t border-curso-borde/60 pt-2.5 first:border-t-0 first:pt-0"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                    <span className="min-w-0 truncate font-semibold text-carbon">
                      {p.payerName}
                    </span>
                    <span className="shrink-0 tabular-nums text-carbon">
                      {formatMoney(p.total)}
                    </span>
                    <span className="w-full text-xs text-carbon/60">
                      {t(`mesa.metodo.${p.method}`)}
                    </span>
                  </span>
                  {paymentActions(p)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {comanda.length > 0 && (
          <section className="mt-6 border-t border-linea pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-marca">{t("mesas.comanda")}</h3>
            {created.length > 0 && (
              <p className="mt-1 text-xs text-carbon/55">{t("mesas.pedidoMesaAyuda")}</p>
            )}
            <p className="mt-1 text-sm text-carbon/70">
              {summarizeKitchen(comanda)
                .map((l) => `${l.quantity} × ${l.name}`)
                .join(" · ")}
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {comanda.map((o) => {
                const porAnotar = o.status === "creado";
                return (
                  <li key={o.id} className="rounded-2xl border border-linea p-3">
                    <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-semibold text-carbon">
                        {o.guestId ? names.get(o.guestId) : "—"}
                      </span>
                      <span className="text-xs text-carbon/55">
                        {new Date(o.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" · "}
                        {porAnotar
                          ? t("mesa.estadoPedido.creado")
                          : t("mesa.estadoPedido.en_preparacion")}
                      </span>
                    </p>
                    <ul className="mt-1.5 text-sm text-carbon/75">
                      {o.items.map((i) => (
                        <li key={i.id}>
                          {i.quantity} × {i.name}
                        </li>
                      ))}
                    </ul>
                    {open && porAnotar && (
                      <button
                        type="button"
                        disabled={busy === o.id}
                        onClick={() => void moveOrder(o, "en_preparacion")}
                        className="mt-3 min-h-12 w-full rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
                      >
                        {t("mesas.pasarAComanda")}
                      </button>
                    )}
                    {open && porAnotar && (
                      <button
                        type="button"
                        disabled={busy === o.id}
                        onClick={() => {
                          void (async () => {
                            const ok = await confirmar({
                              title: t("mesas.cancelarPedidoTitulo"),
                              body: t("mesas.cancelarPedidoConfirmar"),
                              confirmLabel: t("mesas.cancelarPedidoSi"),
                              cancelLabel: t("acciones.volver"),
                              tone: "peligro",
                            });
                            if (ok) await moveOrder(o, "cancelado");
                          })();
                        }}
                        className="mt-2 min-h-11 w-full text-sm font-semibold text-red-600 disabled:opacity-50"
                      >
                        {t("mesas.cancelarPedido")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="mt-6 border-t border-linea pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-carbon/50">
            {t("mesas.cuenta")}
          </h3>
          <ul className="mt-3 flex flex-col gap-1.5">
            {accountRows.map((r) => (
              <li
                key={r.guest.id}
                className="flex items-baseline justify-between gap-3 rounded-xl px-1 py-1 text-sm"
              >
                <span className="truncate font-semibold text-carbon">{r.guest.name}</span>
                <span className="shrink-0 tabular-nums text-carbon/80">
                  {formatMoney(r.consumption)}
                  <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-carbon/45">
                    {t(`mesas.cuentaPersona.${r.status}`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {bill.totals.consumption > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-carbon/45">
                {t("mesas.consumoPorComensal")}
              </h4>
              <ConsumptionTable bill={bill} />
            </div>
          )}
          <div className="mt-4">
            <p className="mb-2 text-xs text-carbon/60">
              {bill.session.splitMode
                ? t("mesa.modoElegido", { m: t(`mesa.modo.${bill.session.splitMode}`) })
                : t("mesas.sinModo")}
              {bill.session.splitMode === "iguales" && bill.session.parts
                ? ` · ${t("mesa.partesN", { n: bill.session.parts })}`
                : ""}
            </p>
            <PaymentRows bill={bill} actions={(p) => paymentActions(p, true)} />
          </div>
        </section>

        <div className="mt-4">
          <TableHistory sessionId={bill.session.id} version={bill.session.version} />
        </div>

        {cobrarOpen && (
          <CobrarModal
            bill={bill}
            settings={settings}
            employeeId={employeeId}
            onClose={() => setCobrarOpen(false)}
            onDone={onChanged}
          />
        )}
      </section>
      <PrintableBill bill={bill} branchName={branchName} employeeName={employeeName} />
    </>
  );
};

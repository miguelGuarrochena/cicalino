"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore } from "@/lib/store/session-store";
import { useConfigStore } from "@/lib/store/config-store";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { useActiveEmployee } from "@/lib/hooks/useActiveEmployee";
import { useTableBills } from "@/lib/hooks/useTableBills";
import { SyncErrorBanner } from "@/components/panel/SyncErrorBanner";
import { MascotLoader } from "@/components/ui/MascotLoader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { TabGlyph } from "@/components/ui/TabGlyph";
import { QrModal } from "@/components/panel/QrModal";
import { TableDetail } from "@/components/panel/mesas/TableDetail";
import { CloseTableModal } from "@/components/panel/mesas/CloseTableModal";
import { KitchenInbox } from "@/components/panel/mesas/KitchenInbox";
import { ChargeInbox } from "@/components/panel/mesas/ChargeInbox";
import { FloorTableTile } from "@/components/panel/mesas/FloorTableTile";
import { JornadaBoard } from "@/components/panel/mesas/JornadaBoard";
import { HistorialModal } from "@/components/panel/mesas/HistorialModal";
import { fetchPaymentSettings, fetchTableQrs, acknowledgeWaiterCall, type TableQrView } from "@/lib/data/tables";
import { updateOrderStatus } from "@/lib/data/orders";
import {
  DEFAULT_PAYMENT_SETTINGS,
  billPending,
  formatMoney,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";
import {
  buildFloor,
  filterFloor,
  kitchenInbox,
  needsPedido,
  nextChargeAfter,
  tableAlert,
  type FloorFilter,
  type FloorTable,
} from "@/lib/tableOps";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { useFloorShift } from "@/lib/hooks/useFloorShift";
import { assignmentByTable, assignmentsForTramo, currentFloorTramo } from "@/lib/floorShift";
import { assignTable } from "@/lib/data/floorShift";
import { useFloorAttention } from "@/lib/hooks/useFloorAttention";
import { idsForTable } from "@/lib/floorAttention";
import { ackTableAttention, setFloorView } from "@/lib/store/attention-store";

const MesasPage = () => {
  const { t } = useApp();
  const toast = useToast();
  const confirmar = useConfirm();
  const branchId = useSessionStore((s) => s.sucursalId);
  const { visibles, canManage, ready: branchReady } = useOperationalAccess();
  const branchName = useConfigStore((s) => s.name);
  const employee = useActiveEmployee();
  const employees = useConfigStore((s) => s.employees);
  const tableCount = useConfigStore((s) => s.tableCount);
  const { bills, ready, live, syncError, refresh } = useTableBills(
    visibles.pagos ? branchId : null,
  );
  const attention = useFloorAttention();
  const { shift, live: shiftLive, refresh: refreshShift } = useFloorShift(
    visibles.pagos ? branchId : null,
    visibles.pagos,
  );
  const [tables, setTables] = useState<TableQrView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [qrRow, setQrRow] = useState<FloorTable | null>(null);
  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [tab, setTab] = useState<FloorFilter | "turno">("pedido");
  const [query, setQuery] = useState("");
  const [kitchenBusy, setKitchenBusy] = useState<string | null>(null);
  /* Llamado, pedido, cuenta y cobro de Mercado Pago los avisa la capa global
   * (PanelAlertDock), que se ve desde cualquier pantalla y queda hasta que
   * alguien la atiende. Acá había tres toasts que contaban lo mismo y se iban
   * solos a los cinco segundos. */
  const [closeBill, setCloseBill] = useState<TableBill | null>(null);
  const [historialOpen, setHistorialOpen] = useState(false);
  const pendingBySession = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    pendingBySession.current = new Map();
  }, [branchId]);

  useLayoutEffect(() => {
    setFloorView(tab === "turno" ? "turno" : tab);
    return () => setFloorView(null);
  }, [tab]);

  useEffect(() => {
    if (!branchId || !visibles.pagos) return;
    let alive = true;
    void fetchPaymentSettings(branchId).then((r) => {
      if (alive && r.ok) setSettings(r.data.settings);
    });
    void fetchTableQrs(branchId).then((r) => {
      if (alive && r.ok) setTables(r.data);
    });
    return () => {
      alive = false;
    };
  }, [branchId, visibles.pagos]);

  const floor = useMemo(() => {
    const rows = buildFloor(tables, bills);
    const by = assignmentByTable(
      assignmentsForTramo(
        shift.assignments,
        currentFloorTramo(shift.turnosPiso),
      ),
    );
    return rows.map((r) => {
      const a = by.get(r.tableNumber);
      return {
        ...r,
        waiterId: a?.employeeId ?? null,
        waiterName: a?.employeeName ?? null,
      };
    });
  }, [tables, bills, shift.assignments, shift.turnosPiso]);
  const shown = useMemo(
    () => filterFloor(floor, tab === "turno" ? "todas" : tab, query),
    [floor, tab, query],
  );
  const inbox = useMemo(() => kitchenInbox(floor), [floor]);
  const pedidoN = floor.filter(needsPedido).length;
  const chargeN = inbox.bills.length;
  const currentBill = bills.find((b) => b.session.id === selected) ?? null;
  const showDetail = Boolean(currentBill) && tab !== "turno";
  const openPending = floor.reduce((s, r) => s + (r.bill ? r.pending : 0), 0);
  const occupied = useMemo(
    () =>
      new Set(
        floor
          .filter((r) => r.bill?.session.status === "abierta")
          .map((r) => r.tableNumber),
      ),
    [floor],
  );

  useEffect(() => {
    if (!selected || tab === "turno") return;
    const current = bills.find((b) => b.session.id === selected);
    if (!current) return;
    const pending = billPending(current);
    const prev = pendingBySession.current.get(selected);
    pendingBySession.current.set(selected, pending);
    if (prev == null || !(prev > 0 && pending <= 0 && current.totals.consumption > 0)) {
      return;
    }
    const next = nextChargeAfter(shown, selected);
    setSelected(next?.bill?.session.id ?? null);
  }, [bills, selected, shown, tab]);

  const reload = () => {
    void refresh();
    void refreshShift();
    if (branchId) {
      void fetchTableQrs(branchId).then((r) => {
        if (r.ok) setTables(r.data);
      });
    }
  };

  const assignWaiter = async (tableNumber: number, employeeId: string | null) => {
    if (!branchId) return { ok: false, reason: "error" };
    const res = await assignTable(
      branchId,
      tableNumber,
      employeeId,
      employee?.id ?? null,
      currentFloorTramo(shift.turnosPiso),
    );
    if (res.ok) void refreshShift();
    return res;
  };

  const openRow = (row: FloorTable) => {
    if (row.bill) {
      const ids = idsForTable(row.bill);
      ackTableAttention(ids.orders, ids.payments, ids.calls, ids.mp);
      setSelected(row.bill.session.id);
      return;
    }
    if (row.qrToken && row.qrActive) setQrRow(row);
  };

  const showQr = (row: FloorTable) => {
    if (row.qrToken) setQrRow(row);
  };

  /* Mesas mueve el pedido a dos lugares y nada más: "ya lo anoté" (pasa a la
   * comanda del local) o "cancelado". Listo/entregado no viven acá: si Mesas
   * también los gestionara, el mismo pedido tendría dos dueños. */
  const moveRows = async (
    row: FloorTable,
    orders: FloorTable["newOrders"],
    to: "en_preparacion" | "cancelado",
  ) => {
    setKitchenBusy(row.key);
    let ok = true;
    for (const o of orders) {
      const done = await updateOrderStatus(o.id, to);
      if (!done) ok = false;
    }
    setKitchenBusy(null);
    if (ok) {
      toast(t(`mesas.pedidoMovido.${to}`), "success");
      reload();
    } else {
      toast(t("mesas.error.error"), "error");
      reload();
    }
  };

  if (!branchReady || !visibles.pagos) {
    return branchReady ? null : (
      <div className="flex min-h-[40vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }

  const emptyFloor = !tables.length && !floor.some((r) => r.bill);
  const showInbox = tab === "pedido";
  const showChargeInbox = tab === "cobrar";
  const inboxCreated = showInbox ? inbox.created : [];
  const inboxCalled = showInbox ? inbox.called : [];
  const inboxBills = showChargeInbox ? inbox.bills : [];
  const requestKeys = new Set(inboxBills.map((r) => r.key));
  const tiles =
    tab === "pedido" || tab === "turno"
      ? []
      : tab === "cobrar"
        ? shown.filter((r) => !requestKeys.has(r.key))
        : shown;
  const mapLayout = tab === "todas";
  const hasInbox = inboxCreated.length + inboxCalled.length + inboxBills.length > 0;
  const newOrderIds = new Set(attention.newOrderIds);
  const newPaymentIds = new Set(attention.newBillIds);
  const newCallIds = new Set(attention.newCallIds);
  const nuevos = {
    orders: newOrderIds,
    payments: newPaymentIds,
    calls: newCallIds,
  };

  const cancelInbox = async (row: FloorTable, orders: FloorTable["newOrders"]) => {
    const marched = orders.some((o) => o.status !== "creado");
    const ok = await confirmar({
      title: t("mesas.cancelarPedidoTitulo"),
      body: marched
        ? t("mesas.cancelarPedidoAnotadoConfirmar")
        : t("mesas.cancelarPedidoConfirmar"),
      confirmLabel: t("mesas.cancelarPedidoSi"),
      cancelLabel: t("acciones.volver"),
      tone: "peligro",
    });
    if (!ok) return;
    void moveRows(row, orders, "cancelado");
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight text-carbon">
            {t("mesas.titulo")}
          </h1>
          <p className="text-sm text-carbon/60">
            {openPending > 0
              ? t("mesas.pendienteTotal", { n: formatMoney(openPending) })
              : t("mesas.subtitulo")}
          </p>
        </div>
        {/* Lo que no se toca durante el servicio: mismo tipo de botón que la
            navegación de arriba —redondo, con ícono— pero en versión de
            contorno, así se lee como botón sin competirle a lo operativo. */}
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <Link
              href="/panel/pagos/qr"
              className="flex min-h-11 items-center gap-2 rounded-full border border-linea bg-surface px-4 text-sm font-semibold text-carbon/70 transition hover:border-carbon/25 hover:text-carbon"
            >
              <TabGlyph k="qr" size={18} />
              {t("mesas.qrGestion")}
            </Link>
          )}
          {/* El día que ya pasó vivía al pie de la lista, donde desaparece
              justo la noche en que hay treinta mesas y alguien necesita
              revisar una. Acá arriba está siempre. */}
          <button
            type="button"
            onClick={() => setHistorialOpen(true)}
            className="flex min-h-11 items-center gap-2 rounded-full border border-linea bg-surface px-4 text-sm font-semibold text-carbon/70 transition hover:border-carbon/25 hover:text-carbon"
          >
            <TabGlyph k="historial" size={18} />
            {t("mesas.historial")}
          </button>
          <button
            type="button"
            aria-pressed={tab === "turno"}
            onClick={() => setTab(tab === "turno" ? "todas" : "turno")}
            className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${
              tab === "turno"
                ? "border-marca bg-marca text-crema"
                : "border-linea bg-surface text-carbon/70 hover:border-carbon/25 hover:text-carbon"
            }`}
          >
            <TabGlyph k="turno" size={18} />
            {t("mesas.filtroTurno")}
          </button>
        </div>
      </header>

      <SyncErrorBanner error={syncError} />

      {live && !ready ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <MascotLoader className="h-16" />
        </div>
      ) : emptyFloor ? (
        <EmptyState
          title={t("mesas.sinMesasAbiertas")}
          body={t("mesas.sinMesasAbiertasBody")}
          action={
            canManage ? (
              <Link
                href="/panel/pagos/qr"
                className="inline-flex min-h-10 items-center text-sm font-semibold text-marca underline-offset-4 hover:underline"
              >
                {t("mesas.qrGestion")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className={`grid gap-4 ${showDetail ? "lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]" : ""}`}>
          <div className={`flex min-w-0 flex-col gap-3 print:hidden ${showDetail ? "hidden lg:flex" : "flex"}`}>
            {tab !== "turno" && (
            <label className="block">
              <span className="sr-only">{t("mesas.buscarMesa")}</span>
              <input
                type="search"
                inputMode="numeric"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("mesas.buscarPlaceholder")}
                className="min-h-11 w-full max-w-sm rounded-2xl border border-linea bg-surface px-4 text-sm text-carbon outline-none placeholder:text-carbon/40 focus:border-marca focus:ring-2 focus:ring-marca/20"
              />
            </label>
            )}

            <SegmentedTabs
              ariaLabel={t("mesas.resumen")}
              accent="pagos"
              value={tab}
              onChange={setTab}
              options={[
                {
                  id: "pedido",
                  label: t("mesas.filtroPedido"),
                  icon: <TabGlyph k="pedido" />,
                  badge: pedidoN,
                  pulse: attention.tabPedidoPulse,
                  tone: "marca",
                },
                {
                  id: "cobrar",
                  label: t("mesas.filtroCobrar"),
                  icon: <TabGlyph k="cobrar" />,
                  badge: chargeN,
                  pulse: attention.tabCobrarPulse,
                  priority: attention.tabCobrarPulse,
                  tone: "curso",
                },
                {
                  id: "todas",
                  label: t("mesas.filtroTodas"),
                  icon: <TabGlyph k="todas" />,
                },
              ]}
            />

            {tab === "turno" ? (
              <JornadaBoard
                branchId={branchId}
                shift={shift}
                live={shiftLive}
                tableCount={tableCount || tables.length}
                occupied={occupied}
                employees={employees}
                canManage={canManage}
                actorId={employee?.id ?? null}
                onChanged={refreshShift}
              />
            ) : (
              <>

            {showInbox && (
              <KitchenInbox
                created={inboxCreated}
                called={inboxCalled}
                busy={kitchenBusy}
                newOrderIds={newOrderIds}
                newCallIds={newCallIds}
                onOpen={openRow}
                onPassToKitchen={(row) => void moveRows(row, row.newOrders, "en_preparacion")}
                onCancel={(row, orders) => void cancelInbox(row, orders)}
                onAcknowledge={(row) => {
                  if (!row.bill) return;
                  setKitchenBusy(row.key);
                  void acknowledgeWaiterCall(row.bill.session.id).then((res) => {
                    setKitchenBusy(null);
                    if (res.ok) {
                      toast(t("mesas.llamadoAtendido"), "success");
                      reload();
                    } else {
                      toast(t("mesas.error.error"), "error");
                    }
                  });
                }}
              />
            )}

            {showChargeInbox && (
              <ChargeInbox
                rows={inboxBills}
                newPaymentIds={newPaymentIds}
                busy={kitchenBusy}
                onOpen={openRow}
              />
            )}

            {!tiles.length && !hasInbox ? (
              <EmptyState
                title={
                  query
                    ? t("mesas.sinResultados")
                    : tab === "pedido"
                      ? t("mesas.sinPedidosCola")
                      : tab === "cobrar"
                        ? t("mesas.sinCobros")
                        : t("mesas.sinAtencion")
                }
                body={
                  query
                    ? undefined
                    : tab === "pedido"
                      ? t("mesas.sinPedidosColaBody")
                      : tab === "cobrar"
                        ? t("mesas.sinCobrosBody")
                        : t("mesas.sinAtencionBody")
                }
              />
            ) : tiles.length ? (
              mapLayout ? (
                <ul
                  className={`grid grid-cols-3 gap-2 ${
                    showDetail
                      ? "sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]"
                      : "sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]"
                  }`}
                >
                  {tiles.map((row) => (
                    <FloorTableTile
                      key={row.key}
                      row={row}
                      alerta={tableAlert(row, nuevos)}
                      active={showDetail && currentBill?.session.id === row.bill?.session.id}
                      onOpen={() => openRow(row)}
                    />
                  ))}
                </ul>
              ) : (
                <ul className="flex flex-col gap-2">
                  {tiles.map((row) => (
                    <FloorTableTile
                      key={row.key}
                      row={row}
                      dense
                      alerta={tableAlert(row, nuevos)}
                      active={showDetail && currentBill?.session.id === row.bill?.session.id}
                      onOpen={() => openRow(row)}
                    />
                  ))}
                </ul>
              )
            ) : null}
              </>
            )}
          </div>

          <div className={showDetail ? "block" : "hidden"}>
            {showDetail && currentBill ? (
              <TableDetail
                key={currentBill.session.id}
                bill={currentBill}
                settings={settings}
                branchName={branchName}
                employeeId={employee?.id ?? null}
                employeeName={employee?.name ?? null}
                canManage={canManage}
                onCloseTable={() => setCloseBill(currentBill)}
                onChanged={reload}
                onBack={() => setSelected(null)}
                waiterName={
                  floor.find((r) => r.bill?.session.id === currentBill.session.id)?.waiterName
                }
                waiterId={
                  floor.find((r) => r.bill?.session.id === currentBill.session.id)?.waiterId
                }
                staff={employees.map((e) => ({ id: e.id, name: e.name }))}
                onAssign={(employeeId) =>
                  assignWaiter(currentBill.session.tableNumber, employeeId)
                }
                onShowQr={
                  (() => {
                    const row = floor.find((r) => r.bill?.session.id === currentBill.session.id);
                    if (!row?.qrToken) return undefined;
                    return () => showQr(row);
                  })()
                }
              />
            ) : null}
          </div>
        </div>
      )}

      {historialOpen && (
        <HistorialModal
          bills={bills}
          waiterFor={(n) => floor.find((r) => r.tableNumber === n)?.waiterName ?? null}
          onSelect={(id) => {
            setHistorialOpen(false);
            setSelected(id);
          }}
          onClose={() => setHistorialOpen(false)}
        />
      )}

      {closeBill && (
        <CloseTableModal
          bill={closeBill}
          employeeId={employee?.id ?? null}
          onClose={() => setCloseBill(null)}
          onClosed={() => {
            setCloseBill(null);
            if (selected === closeBill.session.id) setSelected(null);
            toast(t("mesas.mesaCerrada"), "success");
            reload();
          }}
        />
      )}

      {qrRow?.qrToken && (
        <QrModal
          reference={String(qrRow.tableNumber)}
          token={qrRow.qrToken}
          etiqueta={t("mesa.mesaN", { n: qrRow.tableNumber })}
          pathPrefix="/m"
          venueName={branchName}
          onClose={() => setQrRow(null)}
        />
      )}
    </div>
  );
};

export default MesasPage;

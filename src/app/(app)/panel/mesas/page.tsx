"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { QrModal } from "@/components/panel/QrModal";
import { TableDetail } from "@/components/panel/mesas/TableDetail";
import { KitchenInbox } from "@/components/panel/mesas/KitchenInbox";
import { FloorTableTile } from "@/components/panel/mesas/FloorTableTile";
import { JornadaBoard } from "@/components/panel/mesas/JornadaBoard";
import { STATUS_STYLE } from "@/components/panel/mesas/BillStatusBadge";
import { fetchPaymentSettings, fetchTableQrs, acknowledgeWaiterCall, type TableQrView } from "@/lib/data/tables";
import { updateOrderStatus } from "@/lib/data/orders";
import {
  DEFAULT_PAYMENT_SETTINGS,
  billStatus,
  formatMoney,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";
import {
  buildFloor,
  filterFloor,
  kitchenInbox,
  needsCharge,
  needsPedido,
  type FloorFilter,
  type FloorTable,
} from "@/lib/tableOps";
import { useToast } from "@/components/ui/Toast";
import { useFloorShift } from "@/lib/hooks/useFloorShift";
import { assignmentByTable } from "@/lib/floorShift";
import { assignTable } from "@/lib/data/floorShift";

const MesasPage = () => {
  const { t } = useApp();
  const toast = useToast();
  const branchId = useSessionStore((s) => s.sucursalId);
  const { visibles, canManage, ready: branchReady } = useOperationalAccess();
  const branchName = useConfigStore((s) => s.name);
  const employee = useActiveEmployee();
  const employees = useConfigStore((s) => s.employees);
  const tableCount = useConfigStore((s) => s.tableCount);
  const { bills, ready, live, syncError, refresh } = useTableBills(
    visibles.pagos ? branchId : null,
  );
  const { shift, live: shiftLive, refresh: refreshShift } = useFloorShift(
    visibles.pagos ? branchId : null,
    visibles.pagos,
  );
  const [tables, setTables] = useState<TableQrView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [qrRow, setQrRow] = useState<FloorTable | null>(null);
  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [showClosed, setShowClosed] = useState(false);
  const [tab, setTab] = useState<FloorFilter | "turno">("pedido");
  const [query, setQuery] = useState("");
  const [kitchenBusy, setKitchenBusy] = useState<string | null>(null);

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
    const by = assignmentByTable(shift.assignments);
    return rows.map((r) => {
      const a = by.get(r.tableNumber);
      return {
        ...r,
        waiterId: a?.employeeId ?? null,
        waiterName: a?.employeeName ?? null,
      };
    });
  }, [tables, bills, shift.assignments]);
  const shown = useMemo(
    () => filterFloor(floor, tab === "turno" ? "todas" : tab, query),
    [floor, tab, query],
  );
  const inbox = useMemo(() => kitchenInbox(floor), [floor]);
  const pedidoN = floor.filter(needsPedido).length;
  const chargeN = floor.filter(needsCharge).length;
  const closedBills = bills.filter((b) => b.session.status !== "abierta");
  const currentBill = bills.find((b) => b.session.id === selected) ?? null;
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
    const res = await assignTable(branchId, tableNumber, employeeId, employee?.id ?? null);
    if (res.ok) void refreshShift();
    return res;
  };

  const openRow = (row: FloorTable) => {
    if (row.bill) {
      setSelected(row.bill.session.id);
      return;
    }
    if (row.qrToken && row.qrActive) setQrRow(row);
  };

  const showQr = (row: FloorTable) => {
    if (row.qrToken) setQrRow(row);
  };

  const moveRows = async (
    row: FloorTable,
    orders: FloorTable["newOrders"],
    to: "en_preparacion" | "listo" | "retirado" | "cancelado",
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
  const inboxCreated = showInbox ? inbox.created : [];
  const inboxCalled = showInbox ? inbox.called : [];
  const tiles = tab === "pedido" || tab === "turno" ? [] : shown;
  const mapLayout = tab === "todas";
  const hasInbox = inboxCreated.length + inboxCalled.length > 0;

  const cancelInbox = (row: FloorTable, orders: FloorTable["newOrders"]) => {
    const marched = orders.some((o) => o.status !== "creado");
    if (
      !window.confirm(
        marched ? t("mesas.cancelarPedidoAnotadoConfirmar") : t("mesas.cancelarPedidoConfirmar"),
      )
    ) {
      return;
    }
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
        {canManage && (
          <Link
            href="/panel/mesas/qr"
            className="min-h-10 text-sm font-semibold text-carbon/55 underline-offset-4 hover:text-carbon hover:underline"
          >
            {t("mesas.qrGestion")}
          </Link>
        )}
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
                href="/panel/mesas/qr"
                className="inline-flex min-h-10 items-center text-sm font-semibold text-marca underline-offset-4 hover:underline"
              >
                {t("mesas.qrGestion")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className={`grid gap-4 ${currentBill ? "lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]" : ""}`}>
          <div className={`flex flex-col gap-3 print:hidden ${currentBill ? "hidden lg:flex" : "flex"}`}>
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
              size="sm"
              value={tab}
              onChange={setTab}
              options={[
                { id: "pedido", label: t("mesas.filtroPedido"), badge: pedidoN },
                { id: "cobrar", label: t("mesas.filtroCobrar"), badge: chargeN },
                { id: "todas", label: t("mesas.filtroTodas") },
                { id: "turno", label: t("mesas.filtroTurno") },
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
                onOpen={openRow}
                onPassToKitchen={(row) => void moveRows(row, row.newOrders, "en_preparacion")}
                onCancel={cancelInbox}
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
                    currentBill
                      ? "sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]"
                      : "sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]"
                  }`}
                >
                  {tiles.map((row) => (
                    <FloorTableTile
                      key={row.key}
                      row={row}
                      active={currentBill?.session.id === row.bill?.session.id}
                      onOpen={() => openRow(row)}
                      onShowQr={row.qrToken ? () => showQr(row) : undefined}
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
                      active={currentBill?.session.id === row.bill?.session.id}
                      onOpen={() => openRow(row)}
                      onShowQr={row.qrToken ? () => showQr(row) : undefined}
                    />
                  ))}
                </ul>
              )
            ) : null}

            <ClosedTodayList
              bills={closedBills}
              expanded={showClosed}
              onToggle={() => setShowClosed((v) => !v)}
              onSelect={setSelected}
            />
              </>
            )}
          </div>

          <div className={currentBill ? "block" : "hidden"}>
            {currentBill ? (
              <TableDetail
                key={currentBill.session.id}
                bill={currentBill}
                settings={settings}
                branchName={branchName}
                employeeId={employee?.id ?? null}
                employeeName={employee?.name ?? null}
                canManage={canManage}
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

const ClosedTodayList = ({
  bills,
  expanded,
  onToggle,
  onSelect,
}: {
  bills: TableBill[];
  expanded: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}) => {
  const { t } = useApp();
  if (!bills.length) return null;
  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="min-h-10 text-xs font-semibold text-carbon/60 underline"
      >
        {t("mesas.cerradasHoy", { n: bills.length })}
      </button>
      {expanded && (
        <ul className="mt-1 flex flex-col gap-1">
          {bills.map((b) => (
            <li key={b.session.id}>
              <button
                type="button"
                onClick={() => onSelect(b.session.id)}
                className="flex min-h-10 w-full items-center justify-between rounded-xl px-2 text-left text-sm text-carbon/70 hover:bg-carbon/5"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden className={`size-2 rounded-full ${STATUS_STYLE[billStatus(b)].dot}`} />
                  {t("mesa.mesaN", { n: b.session.tableNumber })}
                </span>
                <span className="tabular-nums">{formatMoney(b.totals.paid)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MesasPage;

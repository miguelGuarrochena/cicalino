"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { useSessionStore } from "@/lib/store/session-store";
import { useConfigStore } from "@/lib/store/config-store";
import { useJornadaActiva } from "@/lib/hooks/useJornadaActiva";
import { JornadaInactivaState } from "@/components/panel/JornadaInactivaState";
import { MascotLoader } from "@/components/ui/MascotLoader";
import { SyncErrorBanner } from "@/components/panel/SyncErrorBanner";
import {
  fetchKitchenBoard,
  isRealBranchId,
  markKitchenDone,
  subscribeOrders,
} from "@/lib/data/orders";
import type { DataError } from "@/lib/data/result";
import { OrderItemBits } from "@/components/OrderItemBits";
import { dingNew } from "@/lib/sound";
import { attachLiveRefresh, coalesced } from "@/lib/realtime";
import { supabaseConfigured } from "@/lib/supabase/config";
import {
  kitchenLanes,
  type KitchenLane,
  type KitchenTicket,
} from "@/lib/kitchen";

const LANES: KitchenLane[] = ["preparando", "hecha"];

const minutesSince = (iso: string, now: number): number =>
  Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));

export default function CocinaPage() {
  const { t } = useApp();
  const toast = useToast();
  const router = useRouter();
  const branchId = useSessionStore((s) => s.sucursalId);
  const readyConfig = useConfigStore((s) => s.branchConfigReady);
  const cocinaModo = useConfigStore((s) => s.cocinaModo);
  const pedidos = useConfigStore((s) => s.moduloPedidos);
  const pagos = useConfigStore((s) => s.moduloPagos);
  const jornadaActiva = useJornadaActiva();
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncError, setSyncError] = useState<DataError | null>(null);
  const [lane, setLane] = useState<KitchenLane>("preparando");
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const knownNew = useRef<Set<string> | null>(null);
  const knownBranch = useRef(branchId);

  const live =
    supabaseConfigured &&
    isRealBranchId(branchId) &&
    cocinaModo === "pantalla" &&
    jornadaActiva &&
    (pedidos || pagos);

  useEffect(() => {
    if (!readyConfig) return;
    if (cocinaModo !== "pantalla" || (!pedidos && !pagos)) router.replace("/panel");
  }, [readyConfig, cocinaModo, pedidos, pagos, router]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!live || !branchId) return;
    let alive = true;
    const reload = coalesced(async () => {
      const res = await fetchKitchenBoard(branchId);
      if (!alive) return;
      if (res.ok) {
        setTickets(res.data);
        setSyncError(null);
      } else {
        setSyncError(res.error);
      }
      setLoaded(true);
    });
    const stop = attachLiveRefresh({
      subscribe: (onChange) => subscribeOrders(branchId, onChange, ":cocina"),
      reload: () => void reload(),
      ticksSano: 4,
    });
    void reload();
    return () => {
      alive = false;
      stop();
    };
  }, [live, branchId]);

  const lanes = useMemo(() => kitchenLanes(tickets), [tickets]);

  useEffect(() => {
    if (knownBranch.current !== branchId) {
      knownBranch.current = branchId;
      knownNew.current = null;
    }
    const ids = new Set(lanes.preparando.map((ticket) => ticket.id));
    if (knownNew.current === null) {
      knownNew.current = ids;
      return;
    }
    const arrived = [...ids].some((id) => !knownNew.current?.has(id));
    knownNew.current = ids;
    if (arrived) dingNew();
  }, [lanes.preparando, branchId]);

  const mover = async (ticket: KitchenTicket) => {
    if (busy || ticket.doneAt) return;
    const doneAt = new Date().toISOString();
    setBusy(ticket.id);
    setTickets((prev) =>
      prev.map((row) => (row.id === ticket.id ? { ...row, doneAt } : row)),
    );
    const res = await markKitchenDone(ticket.id);
    if (!res.ok) {
      toast(t("cocina.error"), "error");
      if (branchId && isRealBranchId(branchId)) {
        const again = await fetchKitchenBoard(branchId);
        if (again.ok) setTickets(again.data);
      }
      setBusy(null);
      return;
    }
    toast(t("cocina.hechaAvisada"), "success");
    setBusy(null);
  };

  if (!readyConfig || cocinaModo !== "pantalla") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }

  if (!jornadaActiva) return <JornadaInactivaState />;

  const active = lanes[lane];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-tight text-carbon">{t("cocina.titulo")}</h1>
        <p className="mt-1 text-sm text-carbon/55">{t("cocina.sub")}</p>
      </div>
      <SyncErrorBanner error={syncError} />
      {!loaded ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <MascotLoader className="h-16" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:hidden" role="tablist" aria-label={t("cocina.titulo")}>
            {LANES.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={lane === id}
                onClick={() => setLane(id)}
                className={`min-h-14 rounded-2xl border px-2 text-sm font-semibold ${
                  lane === id
                    ? "border-marca bg-marca text-crema"
                    : "border-linea bg-surface text-carbon"
                }`}
              >
                {t(`cocina.${id}`)}
                <span className="mt-0.5 block text-xs font-bold tabular-nums">{lanes[id].length}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {LANES.map((id) => (
              <section
                key={id}
                className={id === lane ? "block" : "hidden lg:block"}
                aria-label={t(`cocina.${id}`)}
              >
                <h2 className="mb-2 hidden items-baseline justify-between font-display text-xl uppercase text-carbon lg:flex">
                  {t(`cocina.${id}`)}
                  <span className="text-base tabular-nums text-carbon/45">{lanes[id].length}</span>
                </h2>
                <Lane
                  tickets={id === lane ? active : lanes[id]}
                  lane={id}
                  now={now}
                  busy={busy}
                  onMove={(ticket) => void mover(ticket)}
                />
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const Lane = ({
  tickets,
  lane,
  now,
  busy,
  onMove,
}: {
  tickets: KitchenTicket[];
  lane: KitchenLane;
  now: number;
  busy: string | null;
  onMove: (ticket: KitchenTicket) => void;
}) => {
  const { t } = useApp();
  if (!tickets.length) {
    return (
      <p className="rounded-2xl border border-dashed border-linea px-4 py-8 text-center text-sm text-carbon/45">
        {t("cocina.vacia")}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {tickets.map((ticket) => (
        <TicketCard
          key={ticket.id}
          ticket={ticket}
          lane={lane}
          now={now}
          busy={busy === ticket.id}
          onMove={() => onMove(ticket)}
        />
      ))}
    </ul>
  );
};

const TicketCard = ({
  ticket,
  lane,
  now,
  busy,
  onMove,
}: {
  ticket: KitchenTicket;
  lane: KitchenLane;
  now: number;
  busy: boolean;
  onMove: () => void;
}) => {
  const { t } = useApp();
  const mins = minutesSince(ticket.createdAt, now);
  const title =
    ticket.tableNumber != null
      ? t("mesa.mesaN", { n: ticket.tableNumber })
      : ticket.reference;
  return (
    <li
      className={`rounded-2xl border bg-surface p-4 ${
        mins >= 10 ? "border-curso-borde" : "border-linea"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-3xl uppercase leading-none text-carbon">{title}</p>
        <p className={`text-sm font-semibold tabular-nums ${mins >= 10 ? "text-curso" : "text-carbon/45"}`}>
          {mins} min
        </p>
      </div>
      {ticket.alias && <p className="mt-1 text-sm text-carbon/60">{ticket.alias}</p>}
      {ticket.tableNumber != null && (
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-carbon/40">
          {ticket.reference}
        </p>
      )}
      {ticket.items.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 text-lg text-carbon">
          {ticket.items.map((item, index) => (
            <li key={`${ticket.id}-${index}`}>
              <OrderItemBits quantity={item.quantity} name={item.name} option={item.option} note={item.note} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-carbon/50">{t("cocina.sinDetalle")}</p>
      )}
      {lane === "hecha" ? (
        <p className="mt-4 text-sm font-semibold text-ok">{t("cocina.esperandoMostrador")}</p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={onMove}
          className="mt-4 flex min-h-14 w-full items-center justify-center rounded-full bg-marca text-base font-semibold text-crema disabled:opacity-50"
        >
          {busy ? "…" : t("cocina.marcarHecha")}
        </button>
      )}
    </li>
  );
};

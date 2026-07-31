"use client";

import { useMemo, useState } from "react";
import type { OrganizationRow } from "@/lib/store/superadmin-store";
import { monthlyAmount, isContractPending } from "@/lib/store/superadmin-store";
import {
  daysUntilBilling,
  isInGrace,
  isOverdue,
  toDateOnly,
  type SubscriptionState,
  type SubscriptionStatus,
} from "@/lib/subscription";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const fecha = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

type Filtro =
  | "todos"
  | "trial"
  | "active"
  | "pending_payment"
  | "expired"
  | "por_vencer";

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "trial", label: "En prueba" },
  { key: "active", label: "Activos" },
  { key: "pending_payment", label: "Pendientes de pago" },
  { key: "por_vencer", label: "Vencen en 7 días" },
  { key: "expired", label: "Vencidos" },
];

const ESTADO_LABEL: Record<SubscriptionStatus, string> = {
  trial: "Prueba gratuita",
  active: "Activo",
  pending_payment: "Pendiente de pago",
  expired: "Vencido",
  paused: "Pausado",
};

const ESTADO_CLASS: Record<SubscriptionStatus, string> = {
  trial: "border-marca/40 bg-marca/10 text-marca",
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  pending_payment: "border-amber-500/50 bg-amber-400/15 text-amber-800",
  expired: "border-red-500/40 bg-red-500/10 text-red-700",
  paused: "border-linea bg-carbon/5 text-carbon/60",
};

const asState = (org: OrganizationRow): SubscriptionState => ({
  status: org.estadoSuscripcion,
  plan: org.plan,
  trialEnd: org.pruebaFin,
  nextBilling: org.proximaFactura,
});

export const SubscriptionsPanel = ({
  orgs,
  onVerCliente,
  onRegistrarPago,
}: {
  orgs: OrganizationRow[];
  onVerCliente: (orgId: string) => void;
  onRegistrarPago: (orgId: string) => void;
}) => {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [q, setQ] = useState("");
  const hoy = toDateOnly(new Date());

  const filas = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orgs
      .map((org) => {
        const state = asState(org);
        const faltan = daysUntilBilling(state, hoy);
        return {
          org,
          state,
          faltan,
          vencido: isOverdue(state, hoy),
          enGracia: isInGrace(state, hoy),
          monto: monthlyAmount(org),
        };
      })
      .filter((f) => {
        if (needle && !f.org.name.toLowerCase().includes(needle)) return false;
        if (filtro === "todos") return true;
        if (filtro === "por_vencer") {
          return f.faltan != null && f.faltan >= 0 && f.faltan <= 7;
        }
        return f.org.estadoSuscripcion === filtro;
      })
      .sort((a, b) => {
        const av = a.vencido ? 0 : 1;
        const bv = b.vencido ? 0 : 1;
        if (av !== bv) return av - bv;
        return (a.faltan ?? 9999) - (b.faltan ?? 9999);
      });
  }, [orgs, filtro, q, hoy]);

  const deudores = filas.filter((f) => f.vencido).length;
  const porVencer = filas.filter(
    (f) => f.faltan != null && f.faltan >= 0 && f.faltan <= 7,
  ).length;

  return (
    <section className="rounded-[24px] border border-linea bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl uppercase tracking-tight text-carbon">
            Suscripciones
          </h2>
          <p className="mt-0.5 text-sm text-carbon/55">
            {deudores > 0
              ? `${deudores} ${deudores === 1 ? "cliente atrasado" : "clientes atrasados"} · ${porVencer} por vencer`
              : `Sin atrasos · ${porVencer} por vencer`}
          </p>
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar empresa…"
          className="w-full rounded-xl border border-linea bg-crema/40 px-3 py-2 text-sm text-carbon outline-none transition focus:border-marca sm:w-56"
        />
      </div>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFiltro(f.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              filtro === f.key
                ? "bg-marca text-crema"
                : "border border-linea bg-surface text-carbon/60 hover:bg-carbon/5"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="hidden gap-3 border-b border-linea px-4 pb-2 text-[11px] font-semibold uppercase tracking-wide text-carbon/40 sm:grid sm:grid-cols-[minmax(0,1fr)_120px_150px_130px]">
        <span>Cliente</span>
        <span className="text-right">Cobro</span>
        <span className="text-right">Próximo pago</span>
        <span />
      </div>

      <div className="flex flex-col divide-y divide-linea/70">
        {filas.map(({ org, faltan, vencido, enGracia, monto }) => {
          const activas = org.sucursales.filter((s) => s.activo).length;
          const esperandoContrato = isContractPending(org) && !org.activo;
          const sinCargo = org.plan === "gratis";
          return (
            <div
              key={org.id}
              className={`grid gap-3 px-4 py-3.5 transition sm:grid-cols-[minmax(0,1fr)_120px_150px_130px] sm:items-center ${
                vencido ? "bg-red-50/60 dark:bg-red-500/10" : "hover:bg-crema/40"
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-carbon">
                    {org.name}
                  </p>
                  {esperandoContrato ? (
                    <span className="rounded-full border border-amber-500/50 bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      Esperando condiciones
                    </span>
                  ) : (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ESTADO_CLASS[org.estadoSuscripcion]}`}
                    >
                      {ESTADO_LABEL[org.estadoSuscripcion]}
                    </span>
                  )}
                  {enGracia && (
                    <span className="rounded-full border border-amber-500/50 bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      En gracia
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-carbon/50">
                  {org.ownerEmail}
                  {org.telefono ? ` · ${org.telefono}` : ""}
                </p>
                <p className="text-xs text-carbon/40">
                  {activas} {activas === 1 ? "sucursal activa" : "sucursales activas"}
                  {org.sucursales.length !== activas
                    ? ` de ${org.sucursales.length}`
                    : ""}{" "}
                  · alta {fecha(org.altaEn)}
                </p>
              </div>

              <div className="sm:text-right">
                <span className="text-[11px] uppercase tracking-wide text-carbon/40 sm:hidden">
                  Cobro{" "}
                </span>
                <span className="font-display text-lg tabular-nums text-marca">
                  {sinCargo ? "—" : money.format(monto)}
                </span>
                <p className="text-[11px] text-carbon/45 sm:block">
                  {sinCargo
                    ? "sin cargo"
                    : org.plan === "anual"
                      ? "por año"
                      : "por mes"}
                </p>
              </div>

              <div className="sm:text-right">
                <p
                  className={`text-sm font-semibold tabular-nums ${vencido ? "text-red-700" : "text-carbon"}`}
                >
                  {sinCargo ? "—" : fecha(org.proximaFactura)}
                </p>
                <p
                  className={`text-[11px] ${vencido ? "text-red-600" : "text-carbon/45"}`}
                >
                  {sinCargo
                    ? "sin vencimiento"
                    : faltan == null
                      ? "sin fecha"
                      : faltan < 0
                        ? `${-faltan} ${-faltan === 1 ? "día" : "días"} de atraso`
                        : faltan === 0
                          ? "vence hoy"
                          : `en ${faltan} ${faltan === 1 ? "día" : "días"}`}
                </p>
              </div>

              <div className="flex gap-1.5 sm:flex-col">
                {!sinCargo && (
                  <button
                    type="button"
                    onClick={() => onRegistrarPago(org.id)}
                    className="flex-1 rounded-full bg-marca px-3 py-1.5 text-xs font-semibold text-crema transition hover:bg-marca-fuerte sm:flex-none"
                  >
                    Registrar pago
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onVerCliente(org.id)}
                  className="flex-1 rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/70 transition hover:bg-carbon/5 sm:flex-none"
                >
                  Ver cliente
                </button>
              </div>
            </div>
          );
        })}

        {!filas.length && (
          <p className="py-6 text-center text-sm text-carbon/45">
            Ningún cliente con este filtro.
          </p>
        )}
      </div>
    </section>
  );
};

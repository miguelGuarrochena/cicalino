"use client";

import { useMemo, useState } from "react";
import type { OrganizationRow } from "@/lib/store/superadmin-store";
import { monthlyAmount } from "@/lib/store/superadmin-store";
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
}: {
  orgs: OrganizationRow[];
  onVerCliente: (orgId: string) => void;
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

      <div className="flex flex-col gap-2">
        {filas.map(({ org, faltan, vencido, enGracia, monto }) => (
          <div
            key={org.id}
            className={`rounded-2xl border px-3.5 py-3 transition ${
              vencido
                ? "border-red-400/50 bg-red-50/60 dark:bg-red-500/10"
                : "border-linea bg-crema/30"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-carbon">{org.name}</p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ESTADO_CLASS[org.estadoSuscripcion]}`}
                  >
                    {ESTADO_LABEL[org.estadoSuscripcion]}
                  </span>
                  {enGracia && (
                    <span className="rounded-full border border-amber-500/50 bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      En gracia
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-carbon/55">
                  {org.sucursales.length}{" "}
                  {org.sucursales.length === 1 ? "sucursal" : "sucursales"} ·
                  alta {fecha(org.altaEn)} ·{" "}
                  {org.plan === "gratis"
                    ? "sin cargo"
                    : `${money.format(monto)}/${org.plan === "anual" ? "año" : "mes"}`}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wide text-carbon/40">
                    {org.estadoSuscripcion === "trial"
                      ? "Primera factura"
                      : "Próximo pago"}
                  </p>
                  <p
                    className={`text-sm font-semibold ${vencido ? "text-red-700" : "text-carbon"}`}
                  >
                    {fecha(org.proximaFactura)}
                  </p>
                  {faltan != null && org.plan !== "gratis" && (
                    <p
                      className={`text-[11px] ${vencido ? "text-red-600" : "text-carbon/50"}`}
                    >
                      {faltan < 0
                        ? `${-faltan} ${-faltan === 1 ? "día" : "días"} de atraso`
                        : faltan === 0
                          ? "vence hoy"
                          : `en ${faltan} ${faltan === 1 ? "día" : "días"}`}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onVerCliente(org.id)}
                  className="shrink-0 rounded-full bg-marca px-3.5 py-2 text-xs font-semibold text-crema transition hover:bg-marca-fuerte"
                >
                  Ver cliente
                </button>
              </div>
            </div>

            <p className="mt-2 text-xs text-carbon/45">
              Último pago: {fecha(org.ultimoPagoEn)}
              {org.estadoSuscripcion === "trial" && org.pruebaFin && (
                <> · prueba hasta {fecha(org.pruebaFin)}</>
              )}
            </p>
          </div>
        ))}

        {!filas.length && (
          <p className="py-6 text-center text-sm text-carbon/45">
            Ningún cliente con este filtro.
          </p>
        )}
      </div>
    </section>
  );
};

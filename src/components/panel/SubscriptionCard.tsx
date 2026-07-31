"use client";

import { useEffect, useState } from "react";
import { useSessionStore } from "@/lib/store/session-store";
import { supabaseConfigured } from "@/lib/supabase/config";
import {
  fetchMySubscription,
  type MySubscription,
} from "@/lib/data/subscription";
import {
  daysUntilBilling,
  toDateOnly,
  type SubscriptionStatus,
} from "@/lib/subscription";

const fecha = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const ESTADO: Record<SubscriptionStatus, { label: string; clase: string }> = {
  trial: {
    label: "Prueba gratuita",
    clase: "border-marca/40 bg-marca/10 text-marca",
  },
  active: {
    label: "Activo",
    clase: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  },
  pending_payment: {
    label: "Pendiente de pago",
    clase: "border-amber-500/50 bg-amber-400/15 text-amber-800",
  },
  expired: {
    label: "Vencido",
    clase: "border-red-500/40 bg-red-500/10 text-red-700",
  },
  paused: { label: "Pausado", clase: "border-linea bg-carbon/5 text-carbon/60" },
};

const PLAN_LABEL: Record<string, string> = {
  mensual: "Mensual",
  anual: "Anual",
  gratis: "Sin cargo",
};

const Dato = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-linea bg-crema/40 px-3 py-2.5">
    <p className="text-[11px] uppercase tracking-wide text-carbon/45">{label}</p>
    <p className="mt-0.5 text-sm font-semibold text-carbon">{value}</p>
  </div>
);

export const SubscriptionCard = () => {
  const orgId = useSessionStore((s) => s.organizationId);
  const rol = useSessionStore((s) => s.rol);
  const [sub, setSub] = useState<MySubscription | null>(null);
  const [cargando, setCargando] = useState(true);

  const esDueno = rol === "admin" || rol === "superadmin";

  useEffect(() => {
    if (!esDueno || !supabaseConfigured || !orgId) {
      setCargando(false);
      return;
    }
    let alive = true;
    void fetchMySubscription(orgId).then((r) => {
      if (!alive) return;
      setSub(r);
      setCargando(false);
    });
    return () => {
      alive = false;
    };
  }, [orgId, esDueno]);

  if (!esDueno || cargando || !sub) return null;

  const estado = ESTADO[sub.status];
  const enPrueba = sub.status === "trial";
  const faltan = daysUntilBilling(
    {
      status: sub.status,
      plan: sub.plan,
      trialEnd: sub.pruebaFin,
      nextBilling: sub.proximaFactura,
    },
    toDateOnly(new Date()),
  );

  return (
    <section className="rounded-[24px] border border-linea bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg uppercase tracking-tight text-carbon">
          Suscripción
        </h2>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${estado.clase}`}
        >
          {estado.label}
        </span>
      </div>

      {enPrueba && sub.pruebaFin && (
        <p className="mb-3 text-sm text-carbon/70">
          Podés usar todas las funciones hasta el{" "}
          <b>{fecha(sub.pruebaFin)}</b>
          {faltan != null && faltan >= 0 && (
            <>
              {" "}
              ({faltan === 0 ? "último día" : `quedan ${faltan} días`})
            </>
          )}
          .
        </p>
      )}

      {sub.status === "pending_payment" && (
        <p className="mb-3 text-sm text-carbon/70">
          Nos figura pendiente el pago que vencía el{" "}
          <b>{fecha(sub.proximaFactura)}</b>. Si ya lo hiciste, avisanos y lo
          registramos.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Dato label="Plan" value={PLAN_LABEL[sub.plan] ?? sub.plan} />
        <Dato label="Alta" value={fecha(sub.altaEn)} />
        {enPrueba ? (
          <>
            <Dato label="Fin de prueba" value={fecha(sub.pruebaFin)} />
            <Dato
              label="Primera factura"
              value={fecha(sub.proximaFactura)}
            />
          </>
        ) : (
          <>
            <Dato label="Último pago" value={fecha(sub.ultimoPagoEn)} />
            <Dato
              label={sub.plan === "gratis" ? "Próximo cobro" : "Próxima factura"}
              value={sub.plan === "gratis" ? "Sin cargo" : fecha(sub.proximaFactura)}
            />
          </>
        )}
      </div>
    </section>
  );
};

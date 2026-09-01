"use client";

import { useEffect, useState } from "react";
import { useSessionStore } from "@/lib/store/session-store";
import { useApp } from "@/components/providers/Providers";
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

/* La etiqueta es una clave del diccionario, no la frase: esta tarjeta la ve
 * el dueño y el panel puede estar en inglés. */
const ESTADO: Record<SubscriptionStatus, { clave: string; clase: string }> = {
  trial: {
    clave: "suscripcion.estadoTrial",
    clase: "border-marca/40 bg-marca/10 text-marca",
  },
  active: {
    clave: "suscripcion.estadoActivo",
    clase: "border-ok-borde bg-ok-fondo text-ok",
  },
  pending_payment: {
    clave: "suscripcion.estadoPendiente",
    clase: "border-curso-borde bg-curso-fondo text-curso",
  },
  expired: {
    clave: "suscripcion.estadoVencido",
    clase: "border-alerta-borde bg-alerta-fondo text-alerta",
  },
  paused: {
    clave: "suscripcion.estadoPausado",
    clase: "border-linea bg-carbon/5 text-carbon/60",
  },
};

const PLAN_CLAVE: Record<string, string> = {
  mensual: "suscripcion.planMensual",
  anual: "suscripcion.planAnual",
  gratis: "suscripcion.planGratis",
};

const Dato = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-linea bg-crema/40 px-3 py-2.5">
    <p className="text-[11px] uppercase tracking-wide text-carbon/45">{label}</p>
    <p className="mt-0.5 text-sm font-semibold text-carbon">{value}</p>
  </div>
);

export const SubscriptionCard = () => {
  const { t } = useApp();
  const orgId = useSessionStore((s) => s.organizationId);
  const rol = useSessionStore((s) => s.rol);
  const [sub, setSub] = useState<MySubscription | null>(null);
  const [cargando, setCargando] = useState(true);

  const esDueno = rol === "admin" || rol === "superadmin";

  const hayQueConsultar = esDueno && supabaseConfigured && Boolean(orgId);

  useEffect(() => {
    if (!hayQueConsultar || !orgId) return;
    let alive = true;
    void fetchMySubscription(orgId).then((r) => {
      if (!alive) return;
      setSub(r);
      setCargando(false);
    });
    return () => {
      alive = false;
    };
  }, [orgId, hayQueConsultar]);

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
          {t("suscripcion.titulo")}
        </h2>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${estado.clase}`}
        >
          {t(estado.clave)}
        </span>
      </div>

      {enPrueba && sub.pruebaFin && (
        <p className="mb-3 text-sm text-carbon/70">
          {t("suscripcion.pruebaHasta")}{" "}
          <b>{fecha(sub.pruebaFin)}</b>
          {faltan != null && faltan >= 0 && (
            <>
              {" "}
              (
              {faltan === 0
                ? t("suscripcion.ultimoDia")
                : t("suscripcion.quedanDias", { n: faltan })}
              )
            </>
          )}
          .
        </p>
      )}

      {sub.status === "pending_payment" && (
        <p className="mb-3 text-sm text-carbon/70">
          {t("suscripcion.pendienteVencia")}{" "}
          <b>{fecha(sub.proximaFactura)}</b>. {t("suscripcion.pendienteSub")}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Dato
          label={t("suscripcion.plan")}
          value={PLAN_CLAVE[sub.plan] ? t(PLAN_CLAVE[sub.plan]) : sub.plan}
        />
        <Dato label={t("suscripcion.alta")} value={fecha(sub.altaEn)} />
        {enPrueba ? (
          <>
            <Dato label={t("suscripcion.finPrueba")} value={fecha(sub.pruebaFin)} />
            <Dato
              label={t("suscripcion.primeraFactura")}
              value={fecha(sub.proximaFactura)}
            />
          </>
        ) : (
          <>
            <Dato label={t("suscripcion.ultimoPago")} value={fecha(sub.ultimoPagoEn)} />
            <Dato
              label={t(
                sub.plan === "gratis"
                  ? "suscripcion.proximoCobro"
                  : "suscripcion.proximaFactura",
              )}
              value={
                sub.plan === "gratis"
                  ? t("suscripcion.sinCargo")
                  : fecha(sub.proximaFactura)
              }
            />
          </>
        )}
      </div>
    </section>
  );
};

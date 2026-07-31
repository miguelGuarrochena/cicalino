"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSuperadminStore, monthlyAmount } from "@/lib/store/superadmin-store";
import { refreshOrganizations } from "@/lib/data/superadmin";
import { OrgModal } from "@/components/admin/OrgModal";
import { PaymentModal } from "@/components/admin/PaymentModal";
import { MascotLoader } from "@/components/ui/MascotLoader";
import {
  fetchPayments,
  fetchSentEmails,
  type PaymentRow,
  type SentEmailRow,
} from "@/lib/data/payments";
import {
  daysUntilBilling,
  isInGrace,
  isOverdue,
  toDateOnly,
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

const ESTADO: Record<SubscriptionStatus, { label: string; clase: string }> = {
  trial: { label: "Prueba gratuita", clase: "border-marca/40 bg-marca/10 text-marca" },
  active: {
    label: "Activo",
    clase: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  },
  pending_payment: {
    label: "Pendiente de pago",
    clase: "border-amber-500/50 bg-amber-400/15 text-amber-800",
  },
  expired: { label: "Vencido", clase: "border-red-500/40 bg-red-500/10 text-red-700" },
  paused: { label: "Pausado", clase: "border-linea bg-carbon/5 text-carbon/60" },
};

const TIPO_MAIL: Record<string, string> = {
  condiciones: "Condiciones + pago",
  bienvenida: "Bienvenida",
  trial_5d: "Faltan 5 días de prueba",
  trial_end: "Terminó la prueba",
  overdue: "Pago pendiente",
};

const Bloque = ({
  titulo,
  children,
  accion,
}: {
  titulo: string;
  children: React.ReactNode;
  accion?: React.ReactNode;
}) => (
  <section className="rounded-[24px] border border-linea bg-surface p-4 shadow-sm sm:p-5">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-carbon/45">
        {titulo}
      </h2>
      {accion}
    </div>
    {children}
  </section>
);

const Dato = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-linea bg-crema/40 px-3 py-2.5">
    <p className="text-[11px] uppercase tracking-wide text-carbon/45">{label}</p>
    <p className="mt-0.5 text-sm font-semibold text-carbon">{value}</p>
  </div>
);

const ClientePage = () => {
  const params = useParams<{ id: string }>();
  const orgId = params?.id ?? "";
  const orgs = useSuperadminStore((s) => s.organizaciones);
  const org = orgs.find((o) => o.id === orgId);

  const [pagos, setPagos] = useState<PaymentRow[]>([]);
  const [mails, setMails] = useState<SentEmailRow[]>([]);
  const [pagoAbierto, setPagoAbierto] = useState(false);
  const [editar, setEditar] = useState(false);

  useEffect(() => {
    if (!orgs.length) void refreshOrganizations();
  }, [orgs.length]);

  const recargar = useMemo(
    () => () => {
      if (!orgId) return;
      void Promise.all([fetchPayments(orgId), fetchSentEmails(orgId)]).then(
        ([p, m]) => {
          setPagos(p);
          setMails(m);
        },
      );
    },
    [orgId],
  );

  useEffect(recargar, [recargar]);

  if (!org) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <MascotLoader className="h-16" label="Cargando cliente…" />
      </div>
    );
  }

  const hoy = toDateOnly(new Date());
  const state = {
    status: org.estadoSuscripcion,
    plan: org.plan,
    trialEnd: org.pruebaFin,
    nextBilling: org.proximaFactura,
  };
  const faltan = daysUntilBilling(state, hoy);
  const vencido = isOverdue(state, hoy);
  const estado = ESTADO[org.estadoSuscripcion];

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div>
        <Link
          href="/admin"
          className="text-sm font-semibold text-carbon/50 transition hover:text-marca"
        >
          ← Volver a empresas
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl uppercase tracking-tight text-carbon">
                {org.name}
              </h1>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${estado.clase}`}
              >
                {estado.label}
              </span>
              {isInGrace(state, hoy) && (
                <span className="rounded-full border border-amber-500/50 bg-amber-400/15 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  En gracia
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-carbon/55">
              {org.ownerEmail}
              {org.telefono ? ` · ${org.telefono}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {org.plan !== "gratis" && (
              <button
                type="button"
                onClick={() => setPagoAbierto(true)}
                className="rounded-full bg-marca px-4 py-2 text-sm font-semibold text-crema transition hover:bg-marca-fuerte"
              >
                Registrar pago
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditar(true)}
              className="rounded-full border border-linea px-4 py-2 text-sm font-semibold text-carbon/70 transition hover:bg-carbon/5"
            >
              Editar / acciones
            </button>
          </div>
        </div>
      </div>

      <Bloque titulo="Suscripción">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Dato
            label="Plan"
            value={
              org.plan === "gratis"
                ? "Sin cargo"
                : org.plan === "anual"
                  ? "Anual"
                  : "Mensual"
            }
          />
          <Dato label="Alta" value={fecha(org.altaEn)} />
          {org.estadoSuscripcion === "trial" ? (
            <>
              <Dato label="Fin de prueba" value={fecha(org.pruebaFin)} />
              <Dato label="Primera factura" value={fecha(org.proximaFactura)} />
            </>
          ) : (
            <>
              <Dato label="Último pago" value={fecha(org.ultimoPagoEn)} />
              <Dato label="Próxima factura" value={fecha(org.proximaFactura)} />
            </>
          )}
        </div>
        <p
          className={`mt-3 text-sm ${vencido ? "font-semibold text-red-700" : "text-carbon/60"}`}
        >
          {org.plan === "gratis"
            ? "Cortesía permanente: no genera cobro."
            : faltan == null
              ? "Sin fecha de facturación cargada."
              : faltan < 0
                ? `${-faltan} ${-faltan === 1 ? "día" : "días"} de atraso · ${money.format(monthlyAmount(org))}`
                : `Vence en ${faltan} ${faltan === 1 ? "día" : "días"} · ${money.format(monthlyAmount(org))}${org.plan === "anual" ? "/año" : "/mes"}`}
        </p>
      </Bloque>

      <Bloque titulo={`Sucursales · ${org.sucursales.length}`}>
        {org.sucursales.length ? (
          <ul className="flex flex-col gap-1.5">
            {org.sucursales.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-linea bg-crema/30 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-carbon">
                    {s.name}
                  </p>
                  <p className="truncate text-xs text-carbon/50">
                    {s.moduloPedidos && s.moduloEspera
                      ? "Pack"
                      : s.moduloEspera
                        ? "Espera"
                        : "Pedidos"}
                    {s.direccion ? ` · ${s.direccion}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-right text-xs text-carbon/55">
                  {s.cobroDesde && s.cobroDesde > hoy ? (
                    <span className="text-amber-700">
                      gratis hasta {fecha(s.cobroDesde)}
                    </span>
                  ) : (
                    <>cobrando</>
                  )}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-carbon/45">
            Esta empresa no tiene sucursales cargadas.
          </p>
        )}
      </Bloque>

      <Bloque titulo="Historial de pagos">
        {pagos.length ? (
          <ul className="flex flex-col gap-1.5">
            {pagos.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-linea bg-crema/30 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-carbon">
                    {fecha(p.fecha)}
                  </p>
                  <p className="truncate text-xs text-carbon/50">
                    {fecha(p.periodoDesde)} → {fecha(p.periodoHasta)}
                    {p.medio ? ` · ${p.medio}` : ""}
                    {p.nota ? ` · ${p.nota}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-carbon">
                  {money.format(p.monto)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-carbon/45">
            Todavía no hay pagos registrados.
          </p>
        )}
      </Bloque>

      <Bloque titulo="Mails enviados">
        {mails.length ? (
          <ul className="flex flex-col gap-1.5">
            {mails.map((m) => (
              <li
                key={m.id}
                className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2 ${
                  m.aceptado
                    ? "border-linea bg-crema/30"
                    : "border-red-300/60 bg-red-50/60 dark:bg-red-500/10"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-carbon">
                    {TIPO_MAIL[m.tipo] ?? m.tipo}
                  </p>
                  <p className="truncate text-xs text-carbon/50">
                    {m.destinatario}
                    {m.error ? ` · ${m.error}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-carbon/60">
                    {new Date(m.creadoEn).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p
                    className={`text-[11px] font-semibold ${m.aceptado ? "text-emerald-700" : "text-red-600"}`}
                  >
                    {m.aceptado ? "enviado" : "falló"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-carbon/45">
            Todavía no se le mandó ningún mail.
          </p>
        )}
      </Bloque>

      {pagoAbierto && (
        <PaymentModal
          org={org}
          onClose={() => setPagoAbierto(false)}
          onSaved={() => {
            void refreshOrganizations();
            recargar();
          }}
        />
      )}

      {editar && (
        <OrgModal mode="ver" org={org} onClose={() => setEditar(false)} />
      )}
    </div>
  );
};

export default ClientePage;

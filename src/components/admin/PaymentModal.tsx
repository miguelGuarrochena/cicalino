"use client";

import { useEffect, useMemo, useState } from "react";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { useToast } from "@/components/ui/Toast";
import type { OrganizationRow } from "@/lib/store/superadmin-store";
import { monthlyAmount } from "@/lib/store/superadmin-store";
import { monthlyPriceForBranch, moduleLabel } from "@/lib/pricing";
import {
  fetchPayments,
  fetchSentEmails,
  savePayment,
  type PaymentRow,
  type SentEmailRow,
} from "@/lib/data/payments";
import {
  registerPayment,
  toDateOnly,
  type SubscriptionState,
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

const TIPO_MAIL: Record<string, string> = {
  condiciones: "Condiciones + pago",
  bienvenida: "Bienvenida",
  trial_5d: "Faltan 5 días de prueba",
  trial_end: "Terminó la prueba",
  overdue: "Pago pendiente",
};

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-3 py-2.5 text-sm text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20";

export const PaymentModal = ({
  org,
  onClose,
  onSaved,
}: {
  org: OrganizationRow;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const toast = useToast();
  const [historial, setHistorial] = useState<PaymentRow[]>([]);
  const [mails, setMails] = useState<SentEmailRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const cicloMensual = monthlyAmount(org);
  const [ciclos, setCiclos] = useState(1);
  const [monto, setMonto] = useState(cicloMensual);
  const [fechaPago, setFechaPago] = useState(toDateOnly(new Date()));
  const [medio, setMedio] = useState("");
  const [nota, setNota] = useState("");

  const state: SubscriptionState = useMemo(
    () => ({
      status: org.estadoSuscripcion,
      plan: org.plan,
      trialEnd: org.pruebaFin,
      nextBilling: org.proximaFactura,
    }),
    [org],
  );

  const desglose = useMemo(
    () =>
      org.sucursales
        .filter((b) => b.activo)
        .map((b) => ({
        sucursalId: b.id,
        nombre: b.name,
        pack: moduleLabel({
          pedidos: b.moduloPedidos,
          espera: b.moduloEspera,
        }),
        monto:
          monthlyPriceForBranch({
            pedidos: b.moduloPedidos,
            espera: b.moduloEspera,
          }) * Math.max(1, ciclos),
        })),
    [org.sucursales, ciclos],
  );

  const cycleDay =
    org.diaCiclo ??
    (org.proximaFactura ? Number(org.proximaFactura.slice(8, 10)) : 1);

  const preview = useMemo(
    () => registerPayment(state, cycleDay, ciclos),
    [state, cycleDay, ciclos],
  );

  useEffect(() => {
    setMonto(cicloMensual * Math.max(1, ciclos));
  }, [ciclos, cicloMensual]);

  useEffect(() => {
    let alive = true;
    void Promise.all([fetchPayments(org.id), fetchSentEmails(org.id)]).then(
      ([pagos, enviados]) => {
        if (!alive) return;
        setHistorial(pagos);
        setMails(enviados);
        setCargando(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [org.id]);

  const confirmar = async () => {
    if (guardando) return;
    setGuardando(true);
    const r = await savePayment({
      orgId: org.id,
      state,
      cycleDay,
      cycles: ciclos,
      fecha: fechaPago,
      monto,
      medio,
      nota,
      detalle: desglose,
    });
    setGuardando(false);
    if (!r.ok) {
      toast(r.error ?? "No se pudo registrar el pago", "error");
      return;
    }
    toast(`Pago registrado · próximo ${fecha(r.nextBilling ?? null)}`, "success");
    onSaved();
    onClose();
  };

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="pago-title"
      busy={guardando}
      busyLabel="Registrando…"
      footer={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={guardando}
            onClick={() => void confirmar()}
            className="w-full rounded-full bg-marca px-5 py-3.5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte disabled:opacity-40"
          >
            Registrar pago de {money.format(monto)}
          </button>
          <button
            type="button"
            disabled={guardando}
            onClick={onClose}
            className="w-full rounded-full border border-linea px-5 py-3.5 text-sm font-semibold text-carbon transition hover:bg-crema disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="pago-title"
            className="font-display text-xl uppercase tracking-tight text-carbon"
          >
            {org.name}
          </h2>
          <p className="mt-1 text-sm text-carbon/55">
            Ciclo día {cycleDay} · {org.sucursales.length}{" "}
            {org.sucursales.length === 1 ? "sucursal" : "sucursales"} ·{" "}
            {money.format(cicloMensual)}/
            {org.plan === "anual" ? "año" : "mes"}
          </p>
        </div>
        <ModalCloseBtn disabled={guardando} onClick={onClose} label="Cerrar" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-linea bg-crema/40 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-carbon/45">
            Vence
          </p>
          <p className="text-sm font-semibold text-carbon">
            {fecha(org.proximaFactura)}
          </p>
        </div>
        <div className="rounded-2xl border border-linea bg-crema/40 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-carbon/45">
            Último pago
          </p>
          <p className="text-sm font-semibold text-carbon">
            {fecha(org.ultimoPagoEn)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-carbon/70">Fecha del pago</span>
          <input
            type="date"
            className={INPUT}
            value={fechaPago}
            onChange={(e) => setFechaPago(e.target.value)}
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-carbon/70">
            {org.plan === "anual" ? "Años pagados" : "Meses pagados"}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 6, 12].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCiclos(n)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                  ciclos === n
                    ? "border-marca bg-marca/15 text-marca"
                    : "border-linea bg-surface text-carbon/60 hover:bg-carbon/5"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-carbon/70">Importe</span>
          <input
            type="number"
            className={INPUT}
            value={monto}
            min={0}
            onChange={(e) => setMonto(Number(e.target.value))}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-carbon/70">Medio</span>
            <input
              className={INPUT}
              value={medio}
              onChange={(e) => setMedio(e.target.value)}
              placeholder="Transferencia"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-carbon/70">Nota</span>
            <input
              className={INPUT}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Opcional"
            />
          </label>
        </div>
      </div>

      {desglose.length > 0 && (
        <div className="mt-4 rounded-2xl border border-linea bg-crema/30 px-3.5 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-carbon/45">
            Desglose por sucursal
          </p>
          <ul className="flex flex-col gap-1">
            {desglose.map((d) => (
              <li
                key={d.sucursalId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate text-carbon/75">
                  {d.nombre}{" "}
                  <span className="text-xs text-carbon/45">({d.pack})</span>
                </span>
                <span className="shrink-0 tabular-nums text-carbon">
                  {money.format(d.monto)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-marca/35 bg-marca/10 px-3.5 py-3">
        <p className="text-sm text-carbon/75">
          Cubre del <b>{fecha(preview.periodFrom)}</b> al{" "}
          <b>{fecha(preview.periodTo)}</b>. La próxima factura pasa al{" "}
          <b>{fecha(preview.nextBilling)}</b>.
        </p>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/45">
          Historial de pagos
        </p>
        {cargando ? (
          <p className="text-sm text-carbon/45">Cargando…</p>
        ) : historial.length ? (
          <ul className="flex flex-col gap-1.5">
            {historial.map((p) => (
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
                  </p>
                  {p.detalle.length > 0 && (
                    <p className="truncate text-[11px] text-carbon/40">
                      {p.detalle
                        .map((d) => `${d.nombre} ${money.format(d.monto)}`)
                        .join(" · ")}
                    </p>
                  )}
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
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/45">
          Mails enviados
        </p>
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
      </div>
    </ModalShell>
  );
};

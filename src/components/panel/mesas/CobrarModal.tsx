"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { PaymentStatusBadge } from "@/components/tables/BillParts";
import { confirmTablePayment, registerStaffPayment } from "@/lib/data/tables";
import {
  enabledMethods,
  formatMoney,
  previewPayment,
  type PaymentMethod,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";

const ALL = "__mesa__";

const chip = (active: boolean) =>
  `min-h-11 rounded-full border px-4 text-sm font-semibold transition ${
    active ? "border-marca bg-marca text-crema" : "border-linea bg-surface text-carbon/75"
  }`;

/* Collecting at the table, from a waiter's phone or the register.
 *
 * One screen: what's pending, the method, the amount (prefilled), confirm.
 * Guest payments waiting for confirmation (cash or card announced from the
 * phone) are listed first, because confirming those is usually the job.
 *
 * Cash and cards are collected in hand, so they're recorded as paid. A
 * transfer is recorded as pending unless the waiter ticks that they checked it
 * arrived: someone saying "I sent it" is not confirmation. */
export const CobrarModal = ({
  bill,
  settings,
  employeeId,
  onClose,
  onDone,
}: {
  bill: TableBill;
  settings: PaymentSettings;
  employeeId: string | null;
  onClose: () => void;
  onDone: () => void;
}) => {
  const { t } = useApp();
  const toast = useToast();
  const methods = enabledMethods(settings, { mercadoPagoConnected: false, forStaff: true });
  const mesa = t("mesa.mesaN", { n: bill.session.tableNumber });

  const waiting = bill.payments.filter(
    (p) => p.status === "pendiente" && p.method !== "mercado_pago",
  );
  const mpWaiting = bill.payments.filter(
    (p) => p.status === "pendiente" && p.method === "mercado_pago",
  );

  const remainingFor = (guestId: string | null) => {
    if (!guestId) return bill.totals.available;
    const guest = bill.guests.find((g) => g.id === guestId);
    const claimed = bill.payments
      .filter((p) => p.guestId === guestId && p.status !== "cancelado")
      .reduce((s, p) => s + p.base, 0);
    return Math.min(Math.max((guest?.consumption ?? 0) - claimed, 0), bill.totals.available);
  };

  const [payer, setPayer] = useState(ALL);
  const [amount, setAmount] = useState(String(bill.totals.available || ""));
  const [tip, setTip] = useState("");
  const [method, setMethod] = useState<PaymentMethod | null>(
    methods.find((m) => m === "efectivo") ?? methods[0] ?? null,
  );
  const [transferChecked, setTransferChecked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());

  const guestId = payer === ALL ? null : payer;
  const confirmed = method !== "transferencia" || transferChecked;

  const preview = useMemo(
    () =>
      method
        ? previewPayment(
            bill,
            guestId,
            {
              mode: "monto",
              method,
              amount: Number(amount) || null,
              tipAmount: Number(tip) || null,
            },
            settings,
            new Date(),
            "personal",
          )
        : null,
    [bill, guestId, method, amount, tip, settings],
  );

  const errorText = (reason?: string) => {
    for (const k of [`mesas.error.${reason}`, `mesa.error.${reason}`]) {
      const txt = t(k);
      if (txt !== k) return txt;
    }
    return t("mesas.error.error");
  };

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setKey(crypto.randomUUID());
    setError(null);
  };

  const confirmWaiting = async (id: string) => {
    setBusy(id);
    const res = await confirmTablePayment(id, employeeId);
    setBusy(null);
    if (res.ok) {
      toast(t("mesas.pagoConfirmadoMesa", { n: mesa }), "success");
      onDone();
    } else {
      setError(errorText(res.reason));
    }
  };

  const collect = async () => {
    if (!method || !preview?.ok || busy) return;
    setBusy("cobro");
    setError(null);
    const res = await registerStaffPayment(
      bill.session.id,
      {
        key,
        mode: "monto",
        method: method as Exclude<PaymentMethod, "mercado_pago">,
        amount: preview.base,
        tipAmount: preview.tip || null,
        guestId,
        payerName: guestId ? null : mesa,
        confirmed,
      },
      employeeId,
    );
    setBusy(null);
    if (!res.ok) {
      setError(errorText(res.reason));
      setKey(crypto.randomUUID());
      return;
    }
    toast(
      confirmed
        ? t("mesas.pagoConfirmadoMesa", { n: mesa })
        : t("mesas.transferenciaPendienteMesa", { n: mesa }),
      "success",
    );
    onDone();
    onClose();
  };

  return (
    <ModalShell
      onClose={onClose}
      busy={busy !== null}
      labelledBy="cobrar-title"
      footer={
        bill.totals.available > 0 ? (
          <button
            type="button"
            onClick={() => void collect()}
            disabled={!preview?.ok || busy !== null}
            className="min-h-12 w-full rounded-full bg-marca px-6 font-semibold text-crema transition hover:bg-marca-fuerte active:scale-[0.98] disabled:opacity-50"
          >
            {preview?.ok
              ? t(confirmed ? "mesas.confirmarPagoN" : "mesas.registrarTransferenciaN", {
                  n: formatMoney(preview.total),
                })
              : t("mesas.cobrar")}
          </button>
        ) : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="cobrar-title" className="font-display text-2xl uppercase text-marca">
            {t("mesas.cobrarMesa", { n: mesa })}
          </h2>
          <p className="text-sm text-carbon/65">
            {t("mesas.pendienteN", {
              n: formatMoney(Math.max(bill.totals.total - bill.totals.paid, 0)),
            })}
          </p>
        </div>
        <ModalCloseBtn onClick={onClose} disabled={busy !== null} label={t("mesa.cerrar")} />
      </div>

      <div className="mt-4 flex flex-col gap-4 text-sm">
        {waiting.length > 0 && (
          <section className="rounded-2xl border border-curso-borde bg-curso-fondo p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-curso">
              {t("mesas.esperandoConfirmacion")}
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {waiting.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-semibold text-carbon">{p.payerName}</span>{" "}
                    <span className="tabular-nums text-carbon/80">{formatMoney(p.total)}</span>{" "}
                    <span className="text-carbon/60">· {t(`mesa.metodo.${p.method}`)}</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void confirmWaiting(p.id)}
                    className="min-h-10 rounded-full bg-ok px-4 text-xs font-semibold text-crema disabled:opacity-50"
                  >
                    {p.method === "transferencia" ? t("mesas.confirmarRecibido") : t("mesas.confirmarPago")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {mpWaiting.length > 0 && (
          <ul className="flex flex-col gap-1">
            {mpWaiting.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-xs text-carbon/65">
                <span>
                  {p.payerName} · {formatMoney(p.total)}
                </span>
                <PaymentStatusBadge payment={p} />
              </li>
            ))}
          </ul>
        )}

        {bill.totals.available <= 0 ? (
          <p className="rounded-2xl bg-crema/60 p-3 text-carbon/70">
            {waiting.length || mpWaiting.length ? t("mesas.todoReservado") : t("mesas.nadaPorCobrar")}
          </p>
        ) : (
          <>
            {!methods.length ? (
              <p className="text-carbon/65">
                {t("mesa.sinMetodos")}{" "}
                <a href="/panel/config#pagos" className="font-semibold text-marca underline">
                  {t("nav.config")}
                </a>
              </p>
            ) : (
              <fieldset>
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/50">
                  {t("mesa.metodoTitulo")}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {methods.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={method === m}
                      onClick={() => touch(setMethod)(m)}
                      className={chip(method === m)}
                    >
                      {t(`mesa.metodo.${m}`)}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-carbon/60">{t("mesas.monto")}</span>
                <input
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => touch(setAmount)(e.target.value.replace(/\D/g, ""))}
                  className="min-h-12 rounded-xl border border-linea bg-crema/40 px-3 text-lg font-semibold tabular-nums"
                  aria-describedby="cobrar-max"
                />
                <span id="cobrar-max" className="text-xs text-carbon/50">
                  {t("mesas.maximoN", { n: formatMoney(remainingFor(guestId)) })}
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-carbon/60">{t("mesas.propinaOpcional")}</span>
                <input
                  inputMode="numeric"
                  value={tip}
                  onChange={(e) => touch(setTip)(e.target.value.replace(/\D/g, ""))}
                  placeholder="$0"
                  className="min-h-12 rounded-xl border border-linea bg-crema/40 px-3"
                />
              </label>
            </div>

            {bill.guests.length > 0 && (
              <label className="flex flex-col gap-1">
                <span className="text-carbon/60">{t("mesas.quienPagaOpcional")}</span>
                <select
                  value={payer}
                  onChange={(e) => {
                    const next = e.target.value;
                    touch(setPayer)(next);
                    setAmount(String(remainingFor(next === ALL ? null : next) || ""));
                  }}
                  className="min-h-11 rounded-xl border border-linea bg-crema/40 px-3"
                >
                  <option value={ALL}>{t("mesas.todaLaMesa")}</option>
                  {bill.guests.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {method === "transferencia" && (
              <label className="flex items-start gap-2.5 rounded-2xl border border-linea p-3">
                <input
                  type="checkbox"
                  checked={transferChecked}
                  onChange={(e) => touch(setTransferChecked)(e.target.checked)}
                  className="mt-0.5 size-5 accent-[var(--brand)]"
                />
                <span className="text-carbon/75">{t("mesas.transferenciaVerificada")}</span>
              </label>
            )}

            {preview && !preview.ok && (Number(amount) > 0 || preview.reason !== "monto-invalido") && (
              <p className="text-carbon/65">
                {preview.reason === "excede" && preview.available != null
                  ? t("mesa.error.excede-n", { n: formatMoney(preview.available) })
                  : errorText(preview.reason)}
              </p>
            )}
            {preview?.ok && preview.surcharge > 0 && (
              <p className="text-xs text-carbon/60">
                {t("mesa.lineaRecargo", { n: preview.surchargePercent })}: {formatMoney(preview.surcharge)}
              </p>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="text-red-600">
            {error}
          </p>
        )}
      </div>
    </ModalShell>
  );
};

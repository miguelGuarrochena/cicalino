"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { Select } from "@/components/ui/Select";
import { registerStaffPayment } from "@/lib/data/tables";
import {
  SPLIT_MODES,
  enabledMethods,
  formatMoney,
  previewPayment,
  splitModeLocked,
  type PaymentMethod,
  type PaymentSettings,
  type SplitMode,
  type TableBill,
} from "@/lib/tableBill";

const OTHER = "__otra__";

const chip = (active: boolean) =>
  `min-h-10 rounded-full border px-3 text-sm font-semibold transition ${
    active ? "border-marca bg-marca text-crema" : "border-linea bg-surface text-carbon/75"
  }`;

/* Staff registers a payment on behalf of someone: a guest who paid at the
 * register, or a person who never scanned the QR. Mercado Pago is not offered
 * here — it only exists as an online checkout confirmed by webhook. */
export const StaffPaymentModal = ({
  bill,
  settings,
  employeeId,
  onClose,
  onSaved,
}: {
  bill: TableBill;
  settings: PaymentSettings;
  employeeId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { t } = useApp();
  const locked = splitModeLocked(bill);
  const methods = enabledMethods(settings, { mercadoPagoConnected: false, forStaff: true });

  const [mode, setMode] = useState<SplitMode>(bill.session.splitMode ?? "uno");
  const [payer, setPayer] = useState(bill.guests[0]?.id ?? OTHER);
  const [payerName, setPayerName] = useState("");
  const [totalParts, setTotalParts] = useState(bill.session.parts ?? Math.max(bill.guests.length, 2));
  const [parts, setParts] = useState(1);
  const [amount, setAmount] = useState("");
  const [tip, setTip] = useState("");
  const [method, setMethod] = useState<PaymentMethod | null>(methods[0] ?? null);
  const [confirmed, setConfirmed] = useState(true);
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guestId = payer === OTHER ? null : payer;
  const draft = useMemo(
    () =>
      method
        ? {
            mode,
            method,
            parts: mode === "iguales" ? parts : undefined,
            totalParts: mode === "iguales" && !locked ? totalParts : undefined,
            amount: mode === "monto" ? Number(amount) || null : null,
            tipPercent: null,
            tipAmount: Number(tip) || null,
          }
        : null,
    [method, mode, parts, totalParts, locked, amount, tip],
  );
  const preview = draft ? previewPayment(bill, guestId, draft, settings) : null;

  const save = async () => {
    if (!draft || !preview?.ok || busy) return;
    setBusy(true);
    setError(null);
    const res = await registerStaffPayment(
      bill.session.id,
      {
        ...draft,
        method: draft.method as Exclude<PaymentMethod, "mercado_pago">,
        key,
        guestId,
        payerName: guestId ? null : payerName.trim() || null,
        confirmed,
      },
      employeeId,
    );
    setBusy(false);
    if (res.ok) {
      onSaved();
      return;
    }
    const k = `mesa.error.${res.reason}`;
    const txt = t(k);
    setError(txt === k ? t("mesas.error.error") : txt);
  };

  return (
    <ModalShell
      onClose={onClose}
      busy={busy}
      labelledBy="staff-pay-title"
      footer={
        <button
          type="button"
          onClick={() => void save()}
          disabled={!preview?.ok || busy || (!guestId && !payerName.trim())}
          className="min-h-12 w-full rounded-full bg-marca px-6 font-semibold text-crema disabled:opacity-50"
        >
          {preview?.ok
            ? t(confirmed ? "mesas.registrarCobradoN" : "mesas.registrarPendienteN", {
                n: formatMoney(preview.total),
              })
            : t("mesas.registrarPago")}
        </button>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="staff-pay-title" className="font-display text-2xl uppercase text-marca">
          {t("mesas.registrarPago")}
        </h2>
        <ModalCloseBtn onClick={onClose} disabled={busy} label={t("mesa.cerrar")} />
      </div>

      <div className="mt-4 flex flex-col gap-4 text-sm">
        <label className="flex flex-col gap-1.5">
          <span className="text-carbon/60">{t("mesas.quienPaga")}</span>
          <Select
            value={payer}
            onChange={setPayer}
            options={[
              ...bill.guests.map((g) => ({ value: g.id, label: g.name })),
              { value: OTHER, label: t("mesas.otraPersona") },
            ]}
          />
        </label>
        {payer === OTHER && (
          <input
            value={payerName}
            onChange={(e) => setPayerName(e.target.value)}
            maxLength={40}
            placeholder={t("mesas.nombrePagador")}
            className="rounded-xl border border-linea bg-crema/40 px-3 py-2"
          />
        )}

        <div className="flex flex-wrap gap-2">
          {SPLIT_MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              disabled={locked && bill.session.splitMode !== m}
              onClick={() => setMode(m)}
              className={`${chip(mode === m)} disabled:opacity-40`}
            >
              {t(`mesa.modo.${m}`)}
            </button>
          ))}
        </div>

        {mode === "iguales" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-carbon/60">{t("mesa.partesTotales")}</span>
              <input
                type="number"
                min={1}
                max={50}
                disabled={locked}
                value={locked ? (bill.session.parts ?? totalParts) : totalParts}
                onChange={(e) => setTotalParts(Number(e.target.value) || 1)}
                className="rounded-xl border border-linea bg-crema/40 px-3 py-2 disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-carbon/60">{t("mesa.partesQuePago")}</span>
              <input
                type="number"
                min={1}
                max={50}
                value={parts}
                onChange={(e) => setParts(Math.max(1, Number(e.target.value) || 1))}
                className="rounded-xl border border-linea bg-crema/40 px-3 py-2"
              />
            </label>
          </div>
        )}
        {mode === "monto" && (
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            placeholder={t("mesas.montoPlaceholder", { n: formatMoney(bill.totals.available) })}
            className="rounded-xl border border-linea bg-crema/40 px-3 py-2"
          />
        )}

        <label className="flex flex-col gap-1">
          <span className="text-carbon/60">{t("mesa.propinaTitulo")}</span>
          <input
            inputMode="numeric"
            value={tip}
            onChange={(e) => setTip(e.target.value.replace(/\D/g, ""))}
            placeholder="$0"
            className="rounded-xl border border-linea bg-crema/40 px-3 py-2"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={method === m}
              onClick={() => setMethod(m)}
              className={chip(method === m)}
            >
              {t(`mesa.metodo.${m}`)}
            </button>
          ))}
        </div>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--brand)]"
          />
          <span className="text-carbon/75">{t("mesas.yaCobrado")}</span>
        </label>

        {preview && (
          <div className="rounded-2xl border border-linea bg-crema/50 p-3">
            {preview.ok ? (
              <p className="flex justify-between font-semibold">
                <span>
                  {formatMoney(preview.base)}
                  {preview.tip > 0 && ` + ${formatMoney(preview.tip)}`}
                  {preview.surcharge > 0 && ` + ${formatMoney(preview.surcharge)} (${preview.surchargePercent}%)`}
                </span>
                <span className="text-marca">{formatMoney(preview.total)}</span>
              </p>
            ) : (
              <p className="text-carbon/65">
                {(() => {
                  const k = `mesa.error.${preview.reason}`;
                  const txt = t(k);
                  return txt === k ? t("mesas.error.error") : txt;
                })()}
              </p>
            )}
          </div>
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

"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { Spinner } from "@/components/ui/Spinner";
import { TransferDetails, useErrorText } from "@/components/customer/table/TransferDetails";
import {
  SPLIT_MODES,
  enabledMethods,
  formatMoney,
  previewPayment,
  splitModeLocked,
  type PaymentDraft,
  type PaymentMethod,
  type PaymentSettings,
  type SplitMode,
  type TableBill,
} from "@/lib/tableBill";

type TipChoice = 0 | 5 | 10 | 15 | "otro";

const chip = (active: boolean) =>
  `min-h-10 rounded-full border px-3 text-sm font-semibold transition ${
    active
      ? "border-marca bg-marca text-crema"
      : "border-linea bg-surface text-carbon/75 hover:border-marca/40"
  }`;

export const PaySheet = ({
  token,
  bill,
  guestId,
  settings,
  mercadoPagoReady,
  onClose,
  onBill,
  onStale,
}: {
  token: string;
  bill: TableBill;
  guestId: string;
  settings: PaymentSettings;
  mercadoPagoReady: boolean;
  onClose: () => void;
  /* New bill after a successful payment. The sheet stays open on the result. */
  onBill: (bill: TableBill) => void;
  /* The server said the bill moved: reload it so the preview recomputes. */
  onStale: () => void;
}) => {
  const { t } = useApp();
  const errorText = useErrorText();
  const locked = splitModeLocked(bill);
  const methods = enabledMethods(settings, { mercadoPagoConnected: mercadoPagoReady });

  const [mode, setMode] = useState<SplitMode>(bill.session.splitMode ?? "consumo");
  const [totalParts, setTotalParts] = useState(
    bill.session.parts ?? Math.max(bill.guests.length, 2),
  );
  const [parts, setParts] = useState(1);
  const [amountKind, setAmountKind] = useState<"monto" | "porcentaje">("monto");
  const [amountInput, setAmountInput] = useState("");
  const [tip, setTip] = useState<TipChoice>(0);
  const [tipOther, setTipOther] = useState("");
  const [method, setMethod] = useState<PaymentMethod | null>(methods[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<{ method: PaymentMethod; total: number } | null>(null);

  const draft: PaymentDraft | null = useMemo(() => {
    if (!method) return null;
    const amount = Number(amountInput.replace(/[^\d.,]/g, "").replace(",", "."));
    return {
      mode,
      method,
      parts: mode === "iguales" ? parts : undefined,
      totalParts: mode === "iguales" && !locked ? totalParts : undefined,
      amount: mode === "monto" && amountKind === "monto" && amount > 0 ? Math.trunc(amount) : null,
      percent: mode === "monto" && amountKind === "porcentaje" && amount > 0 ? amount : null,
      tipPercent: tip === "otro" ? null : tip,
      tipAmount: tip === "otro" ? Math.max(0, Math.trunc(Number(tipOther) || 0)) : null,
    };
  }, [method, mode, parts, totalParts, locked, amountKind, amountInput, tip, tipOther]);

  const preview = draft ? previewPayment(bill, guestId, draft, settings) : null;

  /* Anything the guest changes is a different payment attempt. */
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setKey(crypto.randomUUID());
    setError(null);
  };

  const pay = async () => {
    if (!draft || !preview?.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/m/${token}/pagos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, key, expectedTotal: preview.total }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            ok: boolean;
            reason?: string;
            monto_total?: number;
            checkoutUrl?: string | null;
            total?: number;
            bill?: TableBill | null;
          }
        | null;
      if (!data?.ok) {
        setError(
          data?.reason === "monto-cambio" && data.monto_total
            ? t("mesa.error.monto-cambio-n", { n: formatMoney(data.monto_total) })
            : errorText(data?.reason),
        );
        if (
          data?.reason === "monto-cambio" ||
          data?.reason === "modo-bloqueado" ||
          data?.reason === "nada-que-pagar" ||
          data?.reason === "excede"
        ) {
          onStale();
        }
        setKey(crypto.randomUUID());
        return;
      }
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      setResult({ method: draft.method, total: data.total ?? preview.total });
      if (data.bill) onBill(data.bill);
    } catch {
      setError(t("mesa.error.red"));
    } finally {
      setBusy(false);
    }
  };

  const footer = result ? (
    <button
      type="button"
      onClick={onClose}
      className="min-h-12 w-full rounded-full bg-marca px-6 font-semibold text-crema"
    >
      {t("mesa.listo")}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => void pay()}
      disabled={!preview?.ok || busy}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-marca px-6 font-semibold text-crema disabled:opacity-50"
    >
      {busy && <Spinner inline className="size-4" />}
      {preview?.ok
        ? t(method === "mercado_pago" ? "mesa.pagarConMp" : "mesa.pedirCuentaN", {
            n: formatMoney(preview.total),
          })
        : t("mesa.pedirCuenta")}
    </button>
  );

  return (
    <ModalShell onClose={onClose} labelledBy="pay-title" busy={busy} footer={footer}>
      <div className="flex items-start justify-between gap-3">
        <h2 id="pay-title" className="font-display text-2xl uppercase text-marca">
          {result
            ? result.method === "mercado_pago"
              ? t("mesa.pagoRegistrado")
              : t("mesa.cuentaPedida")
            : t("mesa.comoPagar")}
        </h2>
        <ModalCloseBtn onClick={onClose} disabled={busy} label={t("mesa.cerrar")} />
      </div>

      {result ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-carbon/70">
            {t("mesa.cuentaPedidaAyuda", { m: t(`mesa.metodo.${result.method}`) })}
          </p>
          {result.method === "transferencia" ? (
            <TransferDetails settings={settings} total={result.total} />
          ) : null}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/50">
              {t("mesa.modoTitulo")}
            </legend>
            {locked && (
              <p className="mb-2 text-xs text-carbon/55">{t("mesa.modoBloqueado")}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {SPLIT_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  disabled={locked && bill.session.splitMode !== m}
                  onClick={() => touch(setMode)(m)}
                  className={`${chip(mode === m)} rounded-2xl py-2 text-left disabled:opacity-40`}
                >
                  {t(`mesa.modo.${m}`)}
                  <span className="block text-[11px] font-normal opacity-75">
                    {t(`mesa.modoAyuda.${m}`)}
                  </span>
                </button>
              ))}
            </div>

            {mode === "iguales" && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="text-carbon/60">{t("mesa.partesTotales")}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={50}
                    value={locked ? (bill.session.parts ?? totalParts) : totalParts}
                    disabled={locked}
                    onChange={(e) => touch(setTotalParts)(Number(e.target.value) || 1)}
                    className="rounded-xl border border-linea bg-surface px-3 py-2 disabled:opacity-60"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-carbon/60">{t("mesa.partesQuePago")}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={50}
                    value={parts}
                    onChange={(e) => touch(setParts)(Math.max(1, Number(e.target.value) || 1))}
                    className="rounded-xl border border-linea bg-surface px-3 py-2"
                  />
                </label>
              </div>
            )}

            {mode === "monto" && (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex gap-2">
                  {(["monto", "porcentaje"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={amountKind === k}
                      onClick={() => touch(setAmountKind)(k)}
                      className={chip(amountKind === k)}
                    >
                      {t(`mesa.por.${k}`)}
                    </button>
                  ))}
                </div>
                <input
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(e) => touch(setAmountInput)(e.target.value)}
                  placeholder={amountKind === "monto" ? "$" : "%"}
                  className="rounded-xl border border-linea bg-surface px-3 py-2"
                  aria-label={t(`mesa.por.${amountKind}`)}
                />
                <p className="text-xs text-carbon/55">
                  {t("mesa.faltaCubrir", { n: formatMoney(bill.totals.available) })}
                </p>
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/50">
              {t("mesa.propinaTitulo")}
            </legend>
            <div className="flex flex-wrap gap-2">
              {([0, 5, 10, 15, "otro"] as const).map((p) => (
                <button
                  key={String(p)}
                  type="button"
                  aria-pressed={tip === p}
                  onClick={() => touch(setTip)(p)}
                  className={chip(tip === p)}
                >
                  {p === 0 ? t("mesa.sinPropina") : p === "otro" ? t("mesa.otroMonto") : `${p}%`}
                </button>
              ))}
            </div>
            {tip === "otro" && (
              <input
                inputMode="numeric"
                value={tipOther}
                onChange={(e) => touch(setTipOther)(e.target.value.replace(/\D/g, ""))}
                placeholder="$"
                aria-label={t("mesa.otroMonto")}
                className="mt-2 w-full rounded-xl border border-linea bg-surface px-3 py-2"
              />
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/50">
              {t("mesa.metodoTitulo")}
            </legend>
            {!methods.length && <p className="text-sm text-carbon/60">{t("mesa.sinMetodos")}</p>}
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

          {preview && (
            <div className="rounded-2xl border border-linea bg-crema/50 p-4">
              {preview.ok ? (
                <dl className="flex flex-col gap-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-carbon/65">
                      {mode === "iguales"
                        ? t("mesa.lineaPartes", { n: preview.parts })
                        : t("mesa.lineaConsumo")}
                    </dt>
                    <dd className="tabular-nums">{formatMoney(preview.base)}</dd>
                  </div>
                  {preview.tip > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-carbon/65">
                        {tip === "otro" ? t("mesa.lineaPropina") : t("mesa.lineaPropinaPct", { n: tip })}
                      </dt>
                      <dd className="tabular-nums">{formatMoney(preview.tip)}</dd>
                    </div>
                  )}
                  {preview.surcharge > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-carbon/65">
                        {t("mesa.lineaRecargo", { n: preview.surchargePercent })}
                      </dt>
                      <dd className="tabular-nums">{formatMoney(preview.surcharge)}</dd>
                    </div>
                  )}
                  <div className="mt-1 flex justify-between border-t border-linea pt-2 font-semibold">
                    <dt>{t("mesa.total")}</dt>
                    <dd className="font-display text-xl tabular-nums text-marca">
                      {formatMoney(preview.total)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-carbon/65">
                  {preview.reason === "excede" && preview.available != null
                    ? t("mesa.error.excede-n", { n: formatMoney(preview.available) })
                    : errorText(preview.reason)}
                </p>
              )}
              {method === "transferencia" && preview.ok && (
                <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">
                  {t("mesa.transferenciaAviso")}
                </p>
              )}
              {method === "mercado_pago" && preview.ok && (
                <p className="mt-3 text-xs text-carbon/60">{t("mesa.mpAviso")}</p>
              )}
              {(method === "efectivo" || method === "tarjeta_debito" || method === "tarjeta_credito") &&
                preview.ok && (
                  <p className="mt-3 text-xs text-carbon/60">{t("mesa.manualAviso")}</p>
                )}
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      )}
    </ModalShell>
  );
};

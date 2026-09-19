"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { Spinner } from "@/components/ui/Spinner";
import { CustomerNotice } from "@/components/customer/CustomerNotice";
import { TransferDetails, useErrorText } from "@/components/customer/table/TransferDetails";
import {
  SPLIT_MODES,
  enabledMethods,
  formatMoney,
  parsePartCount,
  previewPayment,
  splitModeLocked,
  type PaymentDraft,
  type PaymentMethod,
  type PaymentSettings,
  type SplitMode,
  type TableBill,
} from "@/lib/tableBill";

type TipChoice = 0 | 5 | 10 | 15 | "otro";

/* Pagar, con sitio para pensarlo.
 *
 * Esto era una hoja sobre la carta: cuatro formas de dividir, dos campos
 * numéricos, cinco opciones de propina con su propio campo, hasta seis
 * métodos y un desglose calculado — todo dentro de un contenedor de 92dvh con
 * scroll propio, en un teléfono, con el teclado abierto tapando la mitad. Era
 * la pantalla más compleja del producto metida en el envase más chico.
 *
 * Ahora es una pantalla del flujo: se entra desde la cuenta y se vuelve con un
 * botón que se ve. Las funciones son exactamente las mismas —consumo, partes
 * iguales, paga uno, monto o porcentaje, propina, los seis métodos, Mercado
 * Pago y transferencia—; lo que cambió es que cada decisión tiene aire y que
 * el total y el botón viven abajo, fijos, sin competir con el teclado.
 *
 * 44 px: los chips eran de 40 y se tocan con el pulgar, de pie, con la cuenta
 * ya pedida. El borde de 2 px es para que el elegido se note por algo más que
 * el relleno cuando la pantalla tiene reflejo. */
const chip = (active: boolean) =>
  `min-h-11 rounded-full border-2 px-4 text-base font-semibold transition ${
    active
      ? "border-marca bg-marca text-crema"
      : "border-linea bg-surface text-carbon hover:border-marca/40"
  }`;

export const PayScreen = ({
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
  /* Volver a la cuenta. */
  onClose: () => void;
  /* New bill after a successful payment. The screen stays on the result. */
  onBill: (bill: TableBill) => void;
  /* The server said the bill moved: reload it so the preview recomputes. */
  onStale: () => void;
}) => {
  const { t } = useApp();
  const errorText = useErrorText();
  const locked = splitModeLocked(bill);
  const methods = enabledMethods(settings, { mercadoPagoConnected: mercadoPagoReady });

  const [mode, setMode] = useState<SplitMode>(bill.session.splitMode ?? "consumo");
  const [totalPartsInput, setTotalPartsInput] = useState(
    String(bill.session.parts ?? Math.max(bill.guests.length, 2)),
  );
  const [partsInput, setPartsInput] = useState("1");
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
    const tipPercent = tip === "otro" ? null : tip;
    const tipAmount = tip === "otro" ? Math.max(0, Math.trunc(Number(tipOther) || 0)) : null;
    const common = {
      method,
      amount: mode === "monto" && amountKind === "monto" && amount > 0 ? Math.trunc(amount) : null,
      percent: mode === "monto" && amountKind === "porcentaje" && amount > 0 ? amount : null,
      tipPercent,
      tipAmount,
    };
    if (mode === "iguales") {
      const parts = parsePartCount(partsInput);
      const totalParts = locked
        ? (bill.session.parts ?? parsePartCount(totalPartsInput))
        : parsePartCount(totalPartsInput);
      if (parts == null || totalParts == null) return null;
      return {
        ...common,
        mode,
        parts,
        totalParts: locked ? undefined : totalParts,
      };
    }
    return { ...common, mode };
  }, [
    method,
    mode,
    partsInput,
    totalPartsInput,
    locked,
    bill.session.parts,
    amountKind,
    amountInput,
    tip,
    tipOther,
  ]);

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

  const volver = (
    <button
      type="button"
      onClick={onClose}
      disabled={busy}
      className="flex min-h-12 w-fit items-center gap-2 rounded-full border-2 border-linea bg-surface px-4 text-base font-semibold text-carbon disabled:opacity-50"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18 9 12l6-6" />
      </svg>
      {t("mesa.volverALaCuenta")}
    </button>
  );

  if (result) {
    return (
      <section className="mt-5 flex flex-col gap-5 pb-8">
        {volver}
        <div>
          <h1 className="font-display text-3xl uppercase text-marca">
            {result.method === "mercado_pago"
              ? t("mesa.pagoRegistrado")
              : t("mesa.cuentaPedida")}
          </h1>
        </div>
        <CustomerNotice tone="ok">
          {t("mesa.cuentaPedidaAyuda", { m: t(`mesa.metodo.${result.method}`) })}
        </CustomerNotice>
        {result.method === "transferencia" ? (
          <TransferDetails settings={settings} total={result.total} />
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="min-h-14 w-full rounded-full bg-marca px-6 text-base font-semibold text-crema"
        >
          {t("mesa.volverALaCuenta")}
        </button>
      </section>
    );
  }

  return (
    <section className="mt-5 flex flex-col gap-5 pb-44">
      {volver}

      <div>
        <h1 className="font-display text-3xl uppercase text-marca">{t("mesa.comoPagar")}</h1>
        {/* Cuánto falta, arriba y grande: es el número contra el que se toman
            todas las decisiones de esta pantalla. Estaba perdido en el medio,
            entre la forma de dividir y la propina. */}
        <p className="mt-1 text-lg font-bold text-carbon">
          {t("mesa.faltaCubrir", { n: formatMoney(bill.totals.available) })}
        </p>
      </div>

      <div
        aria-busy={busy || undefined}
        className={`flex flex-col gap-6 ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <div className="mt-4 flex flex-col gap-5">
          <fieldset>
            <legend className="mb-2.5 text-base font-bold uppercase tracking-wide text-carbon">
              {t("mesa.modoTitulo")}
            </legend>
            {locked && (
              <p className="mb-2.5 text-sm leading-relaxed text-suave">{t("mesa.modoBloqueado")}</p>
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
                  <span className="mt-0.5 block text-sm font-normal opacity-90">
                    {t(`mesa.modoAyuda.${m}`)}
                  </span>
                </button>
              ))}
            </div>

            {mode === "iguales" && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-base text-carbon">{t("mesa.partesTotales")}</span>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={locked ? String(bill.session.parts ?? totalPartsInput) : totalPartsInput}
                    disabled={locked}
                    onChange={(e) =>
                      touch(setTotalPartsInput)(e.target.value.replace(/\D/g, "").slice(0, 2))
                    }
                    className="min-h-12 rounded-xl border-2 border-linea bg-surface px-3 text-base disabled:opacity-60"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-base text-carbon">{t("mesa.partesQuePago")}</span>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={partsInput}
                    onChange={(e) =>
                      touch(setPartsInput)(e.target.value.replace(/\D/g, "").slice(0, 2))
                    }
                    className="min-h-12 rounded-xl border-2 border-linea bg-surface px-3 text-base"
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
                  className="min-h-12 rounded-xl border-2 border-linea bg-surface px-3 text-base"
                  aria-label={t(`mesa.por.${amountKind}`)}
                />
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2.5 text-base font-bold uppercase tracking-wide text-carbon">
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
                className="mt-2.5 min-h-12 w-full rounded-xl border-2 border-linea bg-surface px-3 text-base"
              />
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2.5 text-base font-bold uppercase tracking-wide text-carbon">
              {t("mesa.metodoTitulo")}
            </legend>
            {!methods.length && <p className="text-base leading-relaxed text-suave">{t("mesa.sinMetodos")}</p>}
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
                <>
                <dl className="flex flex-col gap-1.5 text-base">
                  <div className="flex justify-between">
                    <dt className="text-suave">
                      {mode === "iguales"
                        ? t("mesa.lineaPartes", { n: preview.parts })
                        : t("mesa.lineaConsumo")}
                    </dt>
                    <dd className="tabular-nums">{formatMoney(preview.base)}</dd>
                  </div>
                  {preview.tip > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-suave">
                        {tip === "otro" ? t("mesa.lineaPropina") : t("mesa.lineaPropinaPct", { n: tip })}
                      </dt>
                      <dd className="tabular-nums">{formatMoney(preview.tip)}</dd>
                    </div>
                  )}
                  {preview.surcharge > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-suave">
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
                <p className="mt-2.5 text-sm font-semibold text-carbon">
                  {preview.remaining > 0
                    ? t("mesa.faltaDespues", { n: formatMoney(preview.remaining) })
                    : t("mesa.cubreTodo")}
                </p>
                </>
              ) : (
                <p className="text-base text-carbon">
                  {preview.reason === "excede" && preview.available != null
                    ? t("mesa.error.excede-n", { n: formatMoney(preview.available) })
                    : errorText(preview.reason)}
                </p>
              )}
              {method === "transferencia" && preview.ok && (
                <p className="mt-3 text-sm leading-relaxed text-carbon">
                  {t("mesa.transferenciaAviso")}
                </p>
              )}
              {method === "mercado_pago" && preview.ok && (
                <p className="mt-3 text-sm leading-relaxed text-suave">{t("mesa.mpAviso")}</p>
              )}
              {(method === "efectivo" ||
                method === "qr_mercado_pago" ||
                method === "tarjeta_debito" ||
                method === "tarjeta_credito") &&
                preview.ok && (
                  <p className="mt-3 text-sm leading-relaxed text-suave">{t("mesa.manualAviso")}</p>
                )}
            </div>
          )}

          {error && (
            <CustomerNotice tone="alerta" role="alert">
              {error}
            </CustomerNotice>
          )}
        </div>
      </div>

      {/* El total y el botón, fijos abajo. Con el teclado abierto —que es lo
          que pasa al escribir un monto o una propina— el botón de una hoja
          quedaba debajo del teclado. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-linea bg-surface/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg flex-col gap-2.5">
          {error && (
            <CustomerNotice tone="alerta" role="alert">
              {error}
            </CustomerNotice>
          )}
          {preview?.ok && (
            <p className="flex flex-wrap items-baseline justify-between gap-2 text-base font-semibold text-carbon">
              {t("mesa.total")}
              <span className="font-display text-2xl tabular-nums text-marca">
                {formatMoney(preview.total)}
              </span>
            </p>
          )}
          <button
            type="button"
            onClick={() => void pay()}
            disabled={!preview?.ok || busy}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-marca px-6 text-base font-semibold text-crema disabled:opacity-50"
          >
            {busy && <Spinner inline className="size-4" />}
            {busy
              ? t("mesa.registrandoPago")
              : preview?.ok
                ? t(method === "mercado_pago" ? "mesa.pagarConMp" : "mesa.pedirCuentaN", {
                    n: formatMoney(preview.total),
                  })
                : t("mesa.pedirCuenta")}
          </button>
        </div>
      </div>
    </section>
  );
};

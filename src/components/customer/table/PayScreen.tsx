"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { Spinner } from "@/components/ui/Spinner";
import { CustomerNotice } from "@/components/customer/CustomerNotice";
import { TransferDetails, useErrorText } from "@/components/customer/table/TransferDetails";
import {
  GUEST_SHARE_MODES,
  billRequested,
  enabledMethods,
  formatMoney,
  myDefinedPayment,
  parsePartCount,
  payAllBase,
  previewGuestShare,
  previewPayAll,
  type PaymentDraft,
  type PaymentMethod,
  type PaymentSettings,
  type SplitMode,
  type TableBill,
} from "@/lib/tableBill";

type TipChoice = 0 | 5 | 10 | 15 | "otro";
type View = "choice" | "payAll" | "split";

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
  onBill,
  onStale,
}: {
  token: string;
  bill: TableBill;
  guestId: string;
  settings: PaymentSettings;
  mercadoPagoReady: boolean;
  onBill: (bill: TableBill) => void;
  onStale: () => void;
}) => {
  const { t } = useApp();
  const errorText = useErrorText();
  const methods = enabledMethods(settings, { mercadoPagoConnected: mercadoPagoReady });
  const requested = billRequested(bill);
  const splitting = bill.session.billState === "dividiendo" || bill.session.billState === "lista";

  const [view, setView] = useState<View>(() => (splitting ? "split" : "choice"));
  const [mode, setMode] = useState<SplitMode>("consumo");
  const [changing, setChanging] = useState(false);
  const [totalPartsInput, setTotalPartsInput] = useState(
    String(bill.session.parts ?? Math.max(bill.guests.length, 2)),
  );
  const [amountInput, setAmountInput] = useState("");
  const [tip, setTip] = useState<TipChoice>(0);
  const [tipOther, setTipOther] = useState("");
  const [method, setMethod] = useState<PaymentMethod | null>(methods[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [done, setDone] = useState<"share" | "request" | "payAll" | null>(null);

  useEffect(() => {
    if (billRequested(bill)) return;
    if (splitting && view === "choice") setView("split");
  }, [bill, splitting, view]);

  const mine = bill.guests.find((g) => g.id === guestId);
  const myDraft = myDefinedPayment(bill, guestId);
  const defined = bill.totals.committedBase;
  const missing = bill.totals.available;
  const ready = bill.session.billState === "lista" || (bill.totals.consumption > 0 && missing <= 0);

  const tipFields = {
    tipPercent: (tip === "otro" ? null : tip) as 0 | 5 | 10 | 15 | null,
    tipAmount: tip === "otro" ? Math.max(0, Math.trunc(Number(tipOther) || 0)) : null,
  };

  const shareDraft: PaymentDraft | null = useMemo(() => {
    if (!method || mode === "uno") return null;
    const amount = Number(amountInput.replace(/[^\d.,]/g, "").replace(",", "."));
    if (mode === "iguales") {
      const totalParts = parsePartCount(totalPartsInput);
      if (totalParts == null) return null;
      return { mode, method, parts: 1, totalParts, ...tipFields };
    }
    return {
      mode,
      method,
      amount: mode === "monto" && amount > 0 ? Math.trunc(amount) : null,
      percent: mode === "porcentaje" && amount > 0 ? amount : null,
      ...tipFields,
    };
  }, [method, mode, amountInput, totalPartsInput, tip, tipOther]);

  const sharePreview = shareDraft ? previewGuestShare(bill, guestId, shareDraft, settings) : null;
  const payAllPreview = method
    ? previewPayAll(bill, guestId, { method, ...tipFields }, settings)
    : null;

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setKey(crypto.randomUUID());
    setError(null);
  };

  const post = async (url: string, body?: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
    });
    return (await res.json().catch(() => null)) as
      | {
          ok: boolean;
          reason?: string;
          monto_total?: number;
          checkoutUrl?: string | null;
          total?: number;
          bill?: TableBill | null;
        }
      | null;
  };

  const handleFail = (data: { reason?: string; monto_total?: number } | null) => {
    setError(
      data?.reason === "monto-cambio" && data.monto_total
        ? t("mesa.error.monto-cambio-n", { n: formatMoney(data.monto_total) })
        : errorText(data?.reason),
    );
    if (
      data?.reason === "monto-cambio" ||
      data?.reason === "excede" ||
      data?.reason === "nada-que-pagar" ||
      data?.reason === "falta-definir" ||
      data?.reason === "cuenta-solicitada"
    ) {
      onStale();
    }
    setKey(crypto.randomUUID());
  };

  const startSplit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await post(`/api/m/${token}/cuenta/dividir`);
      if (!data?.ok) {
        handleFail(data);
        return;
      }
      if (data.bill) onBill(data.bill);
      setView("split");
      setMode("consumo");
      setChanging(false);
    } catch {
      setError(t("mesa.error.red"));
    } finally {
      setBusy(false);
    }
  };

  const confirmShare = async () => {
    if (!shareDraft || !sharePreview?.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await post(`/api/m/${token}/cuenta/parte`, {
        ...shareDraft,
        key,
        expectedTotal: sharePreview.total,
      });
      if (!data?.ok) {
        handleFail(data);
        return;
      }
      if (data.bill) onBill(data.bill);
      setDone("share");
      setChanging(false);
    } catch {
      setError(t("mesa.error.red"));
    } finally {
      setBusy(false);
    }
  };

  const confirmPayAll = async () => {
    if (!method || !payAllPreview?.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await post(`/api/m/${token}/cuenta/pagar-todo`, {
        method,
        key,
        expectedTotal: payAllPreview.total,
        ...tipFields,
      });
      if (!data?.ok) {
        handleFail(data);
        return;
      }
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      if (data.bill) onBill(data.bill);
      setDone("payAll");
    } catch {
      setError(t("mesa.error.red"));
    } finally {
      setBusy(false);
    }
  };

  const requestBill = async () => {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const data = await post(`/api/m/${token}/cuenta/pedir`);
      if (!data?.ok) {
        handleFail(data);
        return;
      }
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      if (data.bill) onBill(data.bill);
      setDone("request");
    } catch {
      setError(t("mesa.error.red"));
    } finally {
      setBusy(false);
    }
  };

  if (requested || done === "payAll" || done === "request") {
    const payer = bill.session.fullPayerName;
    return (
      <section className="mt-5 flex flex-col gap-5 pb-8">
        <div>
          <h1 className="font-display text-3xl uppercase text-marca">{t("mesa.cuentaYaPedida")}</h1>
          <p className="mt-2 text-base leading-relaxed text-carbon">
            {payer && bill.session.fullPayerId !== guestId
              ? t("mesa.cuentaPedidaPor", { n: payer })
              : t("mesa.cuentaYaPedidaAyuda")}
          </p>
        </div>
        <CustomerNotice tone="ok">{t("mesa.cuentaPedidaLocal")}</CustomerNotice>
        <p className="flex items-baseline justify-between gap-3 text-lg font-semibold text-carbon">
          {t("mesa.totalMesa")}
          <span className="font-display text-2xl tabular-nums text-marca">
            {formatMoney(bill.totals.consumption)}
          </span>
        </p>
      </section>
    );
  }

  const totals = (
    <dl className="grid grid-cols-3 gap-2 text-center">
      {(
        [
          ["mesa.totalMesa", bill.totals.consumption, "text-carbon"],
          ["mesa.definido", defined, "text-ok"],
          ["mesa.faltaDefinir", missing, missing > 0 ? "text-curso" : "text-ok"],
        ] as const
      ).map(([k, v, cls]) => (
        <div key={k} className="rounded-2xl border border-linea bg-surface px-2 py-3">
          <dt className="text-sm font-semibold uppercase tracking-wide text-suave">{t(k)}</dt>
          <dd className={`mt-1 font-display text-xl tabular-nums sm:text-2xl ${cls}`}>
            {formatMoney(v)}
          </dd>
        </div>
      ))}
    </dl>
  );

  const methodAndTip = (
    <>
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
    </>
  );

  if (view === "choice") {
    return (
      <section className="mt-5 flex flex-col gap-5 pb-8">
        <div>
          <h1 className="font-display text-3xl uppercase text-marca">{t("mesa.comoQuierenPagar")}</h1>
        </div>
        {error && (
          <CustomerNotice tone="alerta" role="alert">
            {error}
          </CustomerNotice>
        )}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={busy || bill.totals.consumption <= 0}
            onClick={() => {
              setView("payAll");
              setError(null);
            }}
            className="min-h-20 rounded-3xl border-2 border-marca bg-marca px-5 py-4 text-left text-crema disabled:opacity-50"
          >
            <span className="block font-display text-2xl uppercase">{t("mesa.pagarTodo")}</span>
            <span className="mt-1 block text-base font-medium opacity-90">{t("mesa.pagarTodoAyuda")}</span>
          </button>
          <button
            type="button"
            disabled={busy || bill.totals.consumption <= 0}
            onClick={() => void startSplit()}
            className="min-h-20 rounded-3xl border-2 border-linea bg-surface px-5 py-4 text-left text-carbon disabled:opacity-50"
          >
            <span className="block font-display text-2xl uppercase text-marca">{t("mesa.dividirCuenta")}</span>
            <span className="mt-1 block text-base font-medium text-suave">{t("mesa.dividirCuentaAyuda")}</span>
          </button>
        </div>
      </section>
    );
  }

  if (view === "payAll") {
    const preview = payAllPreview;
    return (
      <section className="mt-5 flex flex-col gap-5 pb-44">
        <button
          type="button"
          onClick={() => setView(splitting ? "split" : "choice")}
          disabled={busy}
          className="flex min-h-12 w-fit items-center rounded-full border-2 border-linea bg-surface px-4 text-base font-semibold text-carbon disabled:opacity-50"
        >
          {t("mesa.volverAComoPagar")}
        </button>
        <div>
          <h1 className="font-display text-3xl uppercase text-marca">{t("mesa.pagarTodo")}</h1>
          <p className="mt-1 text-lg font-bold text-carbon">
            {t("mesa.totalMesa")}: {formatMoney(bill.totals.consumption)}
          </p>
          {payAllBase(bill) !== bill.totals.consumption && (
            <p className="mt-1 text-base text-suave">
              {t("mesa.faltaCubrir", { n: formatMoney(payAllBase(bill)) })}
            </p>
          )}
        </div>
        <div className={`flex flex-col gap-6 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {methodAndTip}
          {preview?.ok && method === "transferencia" && (
            <TransferDetails settings={settings} total={preview.total} />
          )}
          {error && (
            <CustomerNotice tone="alerta" role="alert">
              {error}
            </CustomerNotice>
          )}
        </div>
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-linea bg-surface/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-lg flex-col gap-2.5">
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
              onClick={() => void confirmPayAll()}
              disabled={!preview?.ok || busy}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-marca px-6 text-base font-semibold text-crema disabled:opacity-50"
            >
              {busy && <Spinner inline className="size-4" />}
              {t("mesa.confirmarYPedir")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-5 flex flex-col gap-5 pb-44">
      <button
        type="button"
        onClick={() => setView("choice")}
        disabled={busy}
        className="flex min-h-12 w-fit items-center rounded-full border-2 border-linea bg-surface px-4 text-base font-semibold text-carbon disabled:opacity-50"
      >
        {t("mesa.volverAComoPagar")}
      </button>

      <div>
        <h1 className="font-display text-3xl uppercase text-marca">{t("mesa.dividirCuenta")}</h1>
      </div>
      {totals}

      <div className={`flex flex-col gap-6 ${busy ? "pointer-events-none opacity-60" : ""}`}>
        <div className="rounded-2xl border border-marca/40 bg-marca/10 p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-suave">{t("mesa.tuConsumo")}</p>
          <p className="mt-1 font-display text-3xl tabular-nums text-marca">
            {formatMoney(mine?.consumption ?? 0)}
          </p>
          {myDraft && !changing && (
            <p className="mt-2 text-base text-carbon">
              {t("mesa.parteDefinidaAyuda", {
                n: formatMoney(myDraft.total),
                m: t(`mesa.metodo.${myDraft.method}`),
              })}
            </p>
          )}
        </div>

        {changing && (
          <fieldset>
            <legend className="mb-2.5 text-base font-bold uppercase tracking-wide text-carbon">
              {t("mesa.cambiarDivision")}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {GUEST_SHARE_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => touch(setMode)(m)}
                  className={`${chip(mode === m)} rounded-2xl py-2 text-left`}
                >
                  {t(`mesa.modo.${m}`)}
                  <span className="mt-0.5 block text-sm font-normal opacity-90">
                    {t(`mesa.modoAyuda.${m}`)}
                  </span>
                </button>
              ))}
            </div>
            {mode === "iguales" && (
              <label className="mt-3 flex flex-col gap-1">
                <span className="text-base text-carbon">{t("mesa.partesTotales")}</span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={totalPartsInput}
                  onChange={(e) =>
                    touch(setTotalPartsInput)(e.target.value.replace(/\D/g, "").slice(0, 2))
                  }
                  className="min-h-12 rounded-xl border-2 border-linea bg-surface px-3 text-base"
                />
              </label>
            )}
            {(mode === "monto" || mode === "porcentaje") && (
              <input
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => touch(setAmountInput)(e.target.value)}
                placeholder={mode === "monto" ? "$" : "%"}
                className="mt-3 min-h-12 w-full rounded-xl border-2 border-linea bg-surface px-3 text-base"
                aria-label={t(`mesa.modo.${mode}`)}
              />
            )}
          </fieldset>
        )}

        {!changing && (
          <button
            type="button"
            onClick={() => {
              setChanging(true);
              setMode(myDraft && myDraft.mode !== "uno" ? myDraft.mode : "consumo");
              setError(null);
            }}
            className="min-h-12 rounded-full border-2 border-linea px-4 text-base font-semibold text-carbon"
          >
            {t("mesa.cambiarDivision")}
          </button>
        )}

        {(changing || !myDraft) && methodAndTip}

        {sharePreview && (changing || !myDraft) && (
          <div className="rounded-2xl border border-linea bg-crema/50 p-4">
            {sharePreview.ok ? (
              <p className="flex items-baseline justify-between text-base font-semibold">
                {t("mesa.total")}
                <span className="font-display text-xl tabular-nums text-marca">
                  {formatMoney(sharePreview.total)}
                </span>
              </p>
            ) : (
              <p className="text-base text-carbon">
                {sharePreview.reason === "excede" && sharePreview.available != null
                  ? t("mesa.error.excede-n", { n: formatMoney(sharePreview.available) })
                  : errorText(sharePreview.reason)}
              </p>
            )}
          </div>
        )}

        {error && (
          <CustomerNotice tone="alerta" role="alert">
            {error}
          </CustomerNotice>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-linea bg-surface/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg flex-col gap-2.5">
          {(changing || !myDraft) && (
            <button
              type="button"
              onClick={() => void confirmShare()}
              disabled={!sharePreview?.ok || busy}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-marca px-6 text-base font-semibold text-crema disabled:opacity-50"
            >
              {busy && <Spinner inline className="size-4" />}
              {t("mesa.definirParte")}
            </button>
          )}
          {ready && (
            <button
              type="button"
              onClick={() => void requestBill()}
              disabled={busy}
              className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-6 text-base font-semibold disabled:opacity-50 ${
                changing || !myDraft
                  ? "border-2 border-marca bg-surface text-marca"
                  : "bg-marca text-crema"
              }`}
            >
              {busy && <Spinner inline className="size-4" />}
              {t("mesa.pedirCuentaMesa")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

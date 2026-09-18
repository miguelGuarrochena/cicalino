"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { fetchPaymentSettings, savePaymentSettings } from "@/lib/data/tables";
import { disconnectMercadoPago, mercadoPagoAvailable } from "@/lib/actions/mercadopago";
import type { PaymentSettings } from "@/lib/tableBill";

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-3 py-2.5 text-sm text-carbon outline-none focus:border-marca focus:ring-2 focus:ring-marca/20 disabled:opacity-60";

const MethodBox = ({
  label,
  checked,
  disabled,
  onChange,
  children,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) => (
  <div className="rounded-2xl border border-linea p-3">
    <label className="flex items-center justify-between gap-3">
      <span className="font-semibold text-carbon">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-[var(--brand)]"
      />
    </label>
    {children && <div className="mt-2 flex flex-col gap-2 text-sm">{children}</div>}
  </div>
);

const SurchargeInput = ({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) => (
  <label className="flex items-center gap-2">
    <span className="text-carbon/65">{label}</span>
    <input
      type="number"
      min={0}
      max={20}
      step={0.5}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
      className={`${INPUT} w-24`}
    />
    <span className="text-carbon/65">%</span>
  </label>
);

/* Which payment methods guests see, transfer details and card surcharges.
 * Only the owner edits it (the transfer alias decides where the money goes);
 * supervisors see it read-only. RLS enforces the same. */
export const PaymentMethodsCard = ({
  branchId,
  canEdit,
}: {
  branchId: string;
  canEdit: boolean;
}) => {
  const { t } = useApp();
  const toast = useToast();
  const [s, setS] = useState<PaymentSettings | null>(null);
  const [saved, setSaved] = useState<PaymentSettings | null>(null);
  const [mp, setMp] = useState<{ connected: boolean; userId: string | null } | null>(null);
  const [mpAvailable, setMpAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [r, available] = await Promise.all([
      fetchPaymentSettings(branchId),
      mercadoPagoAvailable(),
    ]);
    setMpAvailable(available);
    if (r.ok) {
      setS(r.data.settings);
      setSaved(r.data.settings);
      setMp(r.data.mercadoPago);
    }
  };

  useEffect(() => {
    void load();
    /* The OAuth callback lands here with ?mp=… */
    const estado = new URLSearchParams(window.location.search).get("mp");
    if (estado) {
      toast(t(`cobros.mp.${estado}`), estado === "conectado" ? "success" : "error");
      window.history.replaceState(null, "", window.location.pathname + "#pagos");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  if (!s) return <h2 className="text-sm font-semibold uppercase tracking-wide text-carbon/60">{t("cobros.titulo")}</h2>;

  const set = <K extends keyof PaymentSettings>(k: K, v: PaymentSettings[K]) =>
    setS((cur) => (cur ? { ...cur, [k]: v } : cur));
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const hasSurcharge = s.debitSurchargePct > 0 || s.creditSurchargePct > 0;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await savePaymentSettings(branchId, s);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSaved(s);
    toast(t("cobros.guardado"), "success");
  };

  const disconnect = async () => {
    if (!window.confirm(t("cobros.mp.desconectarConfirmar"))) return;
    const res = await disconnectMercadoPago(branchId);
    if (res.ok) {
      toast(t("cobros.mp.desconectado"), "info");
      await load();
    } else {
      toast(res.error, "error");
    }
  };

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-carbon/60">{t("cobros.titulo")}</h2>
      <p className="mb-4 mt-1 text-sm text-carbon/55">
        {canEdit ? t("cobros.sub") : t("cobros.soloDueno")}
      </p>

      <div className="flex flex-col gap-3">
        <MethodBox
          checked={s.mercadoPago}
          disabled={!canEdit || !mp?.connected}
          onChange={(v) => set("mercadoPago", v)}
          label={t("mesa.metodo.mercado_pago")}
        >
          {!mpAvailable ? (
            <p className="text-xs text-carbon/55">{t("cobros.mp.noConfigurado")}</p>
          ) : mp?.connected ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-emerald-700 dark:text-emerald-300">
                ✓ {t("cobros.mp.conectadoCuenta", { n: mp.userId ?? "" })}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void disconnect()}
                  className="text-xs font-semibold text-carbon/60 underline"
                >
                  {t("cobros.mp.desconectar")}
                </button>
              )}
            </div>
          ) : canEdit ? (
            <a
              href={`/api/mp/oauth/start?local=${encodeURIComponent(branchId)}`}
              className="inline-flex min-h-10 items-center self-start rounded-full bg-marca px-4 text-sm font-semibold text-crema"
            >
              {t("cobros.mp.conectar")}
            </a>
          ) : (
            <p className="text-xs text-carbon/55">{t("cobros.mp.noConectado")}</p>
          )}
          <p className="text-xs text-carbon/55">{t("cobros.mp.ayuda")}</p>
        </MethodBox>

        <MethodBox
          checked={s.transfer}
          disabled={!canEdit}
          onChange={(v) => set("transfer", v)}
          label={t("mesa.metodo.transferencia")}
        >
          <input
            className={INPUT}
            disabled={!canEdit}
            value={s.transferAlias ?? ""}
            maxLength={60}
            onChange={(e) => set("transferAlias", e.target.value || null)}
            placeholder={t("cobros.alias")}
            aria-label={t("cobros.alias")}
          />
          <input
            className={INPUT}
            disabled={!canEdit}
            value={s.transferHolder ?? ""}
            maxLength={80}
            onChange={(e) => set("transferHolder", e.target.value || null)}
            placeholder={t("cobros.titular")}
            aria-label={t("cobros.titular")}
          />
          <input
            className={INPUT}
            disabled={!canEdit}
            inputMode="numeric"
            value={s.transferCbu ?? ""}
            maxLength={22}
            onChange={(e) => set("transferCbu", e.target.value.replace(/\D/g, "") || null)}
            placeholder={t("cobros.cbu")}
            aria-label={t("cobros.cbu")}
          />
          <p className="text-xs text-carbon/55">{t("cobros.transferenciaAyuda")}</p>
        </MethodBox>

        <MethodBox
          checked={s.cash}
          disabled={!canEdit}
          onChange={(v) => set("cash", v)}
          label={t("mesa.metodo.efectivo")}
        >
          <p className="text-xs text-carbon/55">{t("cobros.manualAyuda")}</p>
        </MethodBox>
        <MethodBox
          checked={s.mpQr}
          disabled={!canEdit}
          onChange={(v) => set("mpQr", v)}
          label={t("mesa.metodo.qr_mercado_pago")}
        >
          <p className="text-xs text-carbon/55">{t("cobros.qrMpAyuda")}</p>
        </MethodBox>
        <MethodBox
          checked={s.debit}
          disabled={!canEdit}
          onChange={(v) => set("debit", v)}
          label={t("mesa.metodo.tarjeta_debito")}
        >
          <p className="text-xs text-carbon/55">{t("cobros.tarjetaAyuda")}</p>
          <SurchargeInput
            label={t("cobros.recargo")}
            value={s.debitSurchargePct}
            disabled={!canEdit}
            onChange={(v) => set("debitSurchargePct", v)}
          />
        </MethodBox>
        <MethodBox
          checked={s.credit}
          disabled={!canEdit}
          onChange={(v) => set("credit", v)}
          label={t("mesa.metodo.tarjeta_credito")}
        >
          <p className="text-xs text-carbon/55">{t("cobros.tarjetaAyuda")}</p>
          <SurchargeInput
            label={t("cobros.recargo")}
            value={s.creditSurchargePct}
            disabled={!canEdit}
            onChange={(v) => set("creditSurchargePct", v)}
          />
        </MethodBox>

        {(hasSurcharge || s.surchargeDeclared) && (
          <div className="rounded-2xl border border-amber-400/60 bg-amber-50/80 p-3 text-sm dark:bg-amber-400/10">
            <p className="text-amber-900 dark:text-amber-100">{t("cobros.recargoLegal")}</p>
            <label className="mt-2 flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={s.surchargeDeclared}
                disabled={!canEdit}
                onChange={(e) => set("surchargeDeclared", e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--brand)]"
              />
              <span className="text-carbon/80">{t("cobros.recargoDeclaro")}</span>
            </label>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty}
          className="mt-4 min-h-11 rounded-full bg-marca px-5 text-sm font-semibold text-crema disabled:opacity-50"
        >
          {t("cobros.guardar")}
        </button>
      )}
    </div>
  );
};

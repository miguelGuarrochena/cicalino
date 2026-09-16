"use client";

import { useCallback, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { formatMoney, type PaymentSettings } from "@/lib/tableBill";

/* API reasons → text, with a generic line for anything unexpected. */
export const useErrorText = () => {
  const { t } = useApp();
  return useCallback(
    (reason?: string) => {
      const key = `mesa.error.${reason ?? "red"}`;
      const txt = t(key);
      return txt === key ? t("mesa.error.generico") : txt;
    },
    [t],
  );
};

export const TransferDetails = ({
  settings,
  total,
  compact,
}: {
  settings: PaymentSettings;
  total: number;
  compact?: boolean;
}) => {
  const { t } = useApp();
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      /* Clipboard blocked: the value is on screen to copy by hand. */
    }
  };

  /* There's no universal deep link for bank or wallet apps in Argentina. The
   * share sheet lets the guest hand the alias to whichever app they use; if
   * the device has no share sheet the alias is copied instead. Nothing here
   * confirms the payment. */
  const openApp = async () => {
    const alias = settings.transferAlias ?? "";
    if (navigator.share) {
      try {
        await navigator.share({ text: alias });
        return;
      } catch {
        /* Cancelled: fall through to copying. */
      }
    }
    await copy(alias, "alias");
  };

  return (
    <div className={`flex flex-col gap-2 ${compact ? "" : "rounded-2xl border border-linea bg-surface p-4"}`}>
      {!compact && <p className="text-sm font-semibold text-carbon">{t("mesa.transferenciaTitulo")}</p>}
      <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-carbon/55">{t("mesa.monto")}</dt>
        <dd className="font-semibold tabular-nums text-carbon">{formatMoney(total)}</dd>
        <span />
        <dt className="text-carbon/55">{t("mesa.alias")}</dt>
        <dd className="break-all font-mono text-carbon">{settings.transferAlias}</dd>
        <button
          type="button"
          onClick={() => void copy(settings.transferAlias ?? "", "alias")}
          className="rounded-full border border-linea px-2.5 py-1 text-xs font-semibold text-marca"
        >
          {copied === "alias" ? t("mesa.copiado") : t("mesa.copiar")}
        </button>
        {settings.transferCbu && (
          <>
            <dt className="text-carbon/55">{t("mesa.cbu")}</dt>
            <dd className="break-all font-mono text-xs text-carbon">{settings.transferCbu}</dd>
            <button
              type="button"
              onClick={() => void copy(settings.transferCbu ?? "", "cbu")}
              className="rounded-full border border-linea px-2.5 py-1 text-xs font-semibold text-marca"
            >
              {copied === "cbu" ? t("mesa.copiado") : t("mesa.copiar")}
            </button>
          </>
        )}
        <dt className="text-carbon/55">{t("mesa.titular")}</dt>
        <dd className="text-carbon">{settings.transferHolder}</dd>
        <span />
      </dl>
      <button
        type="button"
        onClick={() => void openApp()}
        className="min-h-10 rounded-full border-2 border-marca px-4 text-sm font-semibold text-marca"
      >
        {t("mesa.abrirApp")}
      </button>
      <p className="text-xs text-amber-800 dark:text-amber-200">{t("mesa.transferenciaAviso")}</p>
    </div>
  );
};

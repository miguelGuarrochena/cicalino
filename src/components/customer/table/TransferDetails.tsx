"use client";

import { useCallback, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { CustomerNotice } from "@/components/customer/CustomerNotice";
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

  /* Los "Copiar" medían 26 px de alto y eran de 12 px. Es el gesto del que
   * depende que la plata llegue bien —un alias mal tipeado es una
   * transferencia a otra persona— y estaba resuelto con el control más chico
   * de toda la pantalla. */
  const copiar =
    "inline-flex min-h-11 shrink-0 items-center rounded-full border-2 border-marca px-4 text-sm font-semibold text-marca";

  return (
    <div className={`flex flex-col gap-3 ${compact ? "" : "rounded-2xl border border-linea bg-surface p-4"}`}>
      {!compact && (
        <p className="text-lg font-semibold text-carbon">{t("mesa.transferenciaTitulo")}</p>
      )}
      {/* Cada dato en su fila, con el botón abajo: en 375 px, una grilla de
          tres columnas con un CBU de 22 dígitos y un botón de 44 px no entra
          sin romper el número o empujar el botón fuera de la pantalla. */}
      <dl className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-base text-suave">{t("mesa.monto")}</dt>
          <dd className="text-lg font-bold tabular-nums text-carbon">{formatMoney(total)}</dd>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <dt className="w-full text-base text-suave">{t("mesa.alias")}</dt>
          <dd className="min-w-0 flex-1 break-all font-mono text-base text-carbon">
            {settings.transferAlias}
          </dd>
          <button
            type="button"
            onClick={() => void copy(settings.transferAlias ?? "", "alias")}
            className={copiar}
          >
            {copied === "alias" ? t("mesa.copiado") : t("mesa.copiar")}
          </button>
        </div>
        {settings.transferCbu && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <dt className="w-full text-base text-suave">{t("mesa.cbu")}</dt>
            <dd className="min-w-0 flex-1 break-all font-mono text-base text-carbon">
              {settings.transferCbu}
            </dd>
            <button
              type="button"
              onClick={() => void copy(settings.transferCbu ?? "", "cbu")}
              className={copiar}
            >
              {copied === "cbu" ? t("mesa.copiado") : t("mesa.copiar")}
            </button>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-base text-suave">{t("mesa.titular")}</dt>
          <dd className="text-base font-semibold text-carbon">{settings.transferHolder}</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={() => void openApp()}
        className="min-h-12 rounded-full border-2 border-marca px-4 text-base font-semibold text-marca"
      >
        {t("mesa.abrirApp")}
      </button>
      {/* Era `text-amber-800` con un `dark:` que nunca aplicaba: ámbar oscuro
          sobre el fondo del local, sin banda propia que lo sostenga. */}
      <CustomerNotice tone="curso">{t("mesa.transferenciaAviso")}</CustomerNotice>
    </div>
  );
};

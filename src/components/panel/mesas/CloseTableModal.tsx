"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { closeTable } from "@/lib/data/tables";
import { formatMoney, type TableBill } from "@/lib/tableBill";

/* Closing with consumption still uncovered is allowed (people leave, the
 * house invites) but needs a reason, which goes to the audit log. */
export const CloseTableModal = ({
  bill,
  employeeId,
  onClose,
  onClosed,
}: {
  bill: TableBill;
  employeeId: string | null;
  onClose: () => void;
  onClosed: () => void;
}) => {
  const { t } = useApp();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uncovered = bill.totals.uncovered;
  const pending = bill.payments.some((p) => p.status === "pendiente");

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await closeTable(bill.session.id, reason.trim() || null, employeeId);
    setBusy(false);
    if (res.ok) {
      onClosed();
      return;
    }
    const key = `mesas.error.${res.reason}`;
    const txt = t(key);
    setError(txt === key ? t("mesas.error.error") : txt);
  };

  return (
    <ModalShell
      onClose={onClose}
      busy={busy}
      labelledBy="close-table-title"
      footer={
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || pending || (uncovered > 0 && !reason.trim())}
          className="min-h-12 w-full rounded-full bg-marca px-6 font-semibold text-crema disabled:opacity-50"
        >
          {t("mesas.cerrarMesa")}
        </button>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="close-table-title" className="font-display text-2xl uppercase text-marca">
          {t("mesas.cerrarMesaN", { n: bill.session.tableNumber })}
        </h2>
        <ModalCloseBtn onClick={onClose} disabled={busy} label={t("mesa.cerrar")} />
      </div>
      {pending ? (
        <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">{t("mesas.error.pagos-pendientes")}</p>
      ) : uncovered > 0 ? (
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm text-carbon/70">
            {t("mesas.cerrarConSaldo", { n: formatMoney(uncovered) })}
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            autoFocus
            className="rounded-xl border border-linea bg-crema/40 px-4 py-3"
            placeholder={t("mesas.motivoPlaceholder")}
          />
        </label>
      ) : (
        <p className="mt-4 text-sm text-carbon/70">{t("mesas.cerrarSinSaldo")}</p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </ModalShell>
  );
};

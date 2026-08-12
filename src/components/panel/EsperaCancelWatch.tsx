"use client";

import { useSyncExternalStore } from "react";
import { useWaitlistCancelWatch } from "@/lib/hooks/useWaitlistCancelWatch";
import {
  dismissGuestCancelAlert,
  getGuestCancelAlertSnapshot,
  peekGuestCancelAlert,
  subscribeGuestCancelAlerts,
} from "@/lib/store/waitlist-alerts-store";
import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";

const useGuestCancelAlert = () =>
  useSyncExternalStore(
    subscribeGuestCancelAlerts,
    peekGuestCancelAlert,
    () => null,
  );

const useGuestCancelQueueLen = () =>
  useSyncExternalStore(
    subscribeGuestCancelAlerts,
    () => getGuestCancelAlertSnapshot().length,
    () => 0,
  );

export const EsperaCancelWatch = () => {
  useWaitlistCancelWatch();
  const { locale } = useApp();
  const alert = useGuestCancelAlert();
  const pending = useGuestCancelQueueLen();

  if (!alert) return null;

  const cerrar = () => dismissGuestCancelAlert(alert.id);

  return (
    <ModalShell onClose={cerrar} labelledBy="espera-cancel-alert-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
            {locale === "en" ? "Waitlist" : "Lista de espera"}
          </p>
          <h2
            id="espera-cancel-alert-title"
            className="mt-1 font-display text-2xl uppercase tracking-tight text-carbon"
          >
            {locale === "en" ? "Guest cancelled" : "Cliente canceló"}
          </h2>
        </div>
        <ModalCloseBtn
          onClick={cerrar}
          label={locale === "en" ? "Dismiss" : "Cerrar"}
        />
      </div>
      <p className="mt-3 text-sm text-carbon/70">
        {locale === "en" ? (
          <>
            <span className="font-semibold text-carbon">{alert.name}</span> left
            the waitlist. Don’t call them or hold a table for them.
          </>
        ) : (
          <>
            <span className="font-semibold text-carbon">{alert.name}</span> se
            fue de la lista. No lo llames ni le reserves mesa.
          </>
        )}
      </p>
      {pending > 1 && (
        <p className="mt-2 text-xs font-medium text-carbon/45">
          {locale === "en"
            ? `${pending - 1} more after this`
            : `${pending - 1} más después de este`}
        </p>
      )}
      <button
        type="button"
        onClick={cerrar}
        className="mt-6 w-full rounded-full bg-carbon px-5 py-3.5 text-sm font-semibold text-crema transition hover:opacity-90"
      >
        {locale === "en" ? "Got it" : "Entendido"}
      </button>
    </ModalShell>
  );
};

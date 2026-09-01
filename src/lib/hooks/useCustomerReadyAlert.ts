"use client";

import { useEffect, useRef, useState } from "react";
import {
  CUSTOMER_REAVISO_MIN_MS,
  shouldFireCustomerAlert,
  shouldReplayFromPush,
} from "@/lib/customerAlert";
import { CUSTOMER_SW_REFRESH } from "@/lib/hooks/customerPollWake";

interface Args {
  active: boolean;
  status: string | null;
  notifiedAt: string | null;
  /** True mientras el cliente todavía está esperando (no llegó el primer aviso). */
  isWaiting: boolean;
  onAlert: () => void;
}

/**
 * Flash + pop + callback (beep/vibrar) la primera vez que pasa a listo/avisado
 * y otra vez en "Volver a avisar" (avisado_en nuevo o push del SW).
 */
export const useCustomerReadyAlert = ({
  active,
  status,
  notifiedAt,
  isWaiting,
  onAlert,
}: Args): { flash: boolean; tick: number } => {
  const [flash, setFlash] = useState(false);
  const [tick, setTick] = useState(0);
  const ultimoAviso = useRef<string | null>(null);
  const lastFiredAt = useRef<number | null>(null);
  const pending = useRef(false);
  const sawWaiting = useRef(false);
  const flashTimer = useRef<number | undefined>(undefined);
  const onAlertRef = useRef(onAlert);
  onAlertRef.current = onAlert;
  const activeRef = useRef(active);
  activeRef.current = active;
  const statusRef = useRef(status);
  statusRef.current = status;

  if (isWaiting) sawWaiting.current = true;

  const fireRef = useRef<() => void>(() => {});
  fireRef.current = () => {
    lastFiredAt.current = Date.now();
    pending.current = false;
    setTick((n) => n + 1);
    setFlash(true);
    if (flashTimer.current !== undefined) {
      window.clearTimeout(flashTimer.current);
    }
    flashTimer.current = window.setTimeout(() => setFlash(false), 900);
    onAlertRef.current();
  };

  const tooSoon = (): boolean =>
    lastFiredAt.current != null &&
    Date.now() - lastFiredAt.current < CUSTOMER_REAVISO_MIN_MS;

  useEffect(() => {
    if (!active || !status) return;
    const { fire: should, key } = shouldFireCustomerAlert({
      prevKey: ultimoAviso.current,
      status,
      notifiedAt,
    });
    const isFirst = ultimoAviso.current === null;
    ultimoAviso.current = key;
    if (isFirst && !sawWaiting.current) return;
    if (!should || tooSoon()) return;
    fireRef.current();
  }, [active, status, notifiedAt]);

  useEffect(() => {
    const tryPushReplay = () => {
      if (!activeRef.current || !statusRef.current) return;
      if (
        !shouldReplayFromPush({
          alreadyAlerted: ultimoAviso.current !== null,
          lastFiredAt: lastFiredAt.current,
        })
      ) {
        return;
      }
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        pending.current = true;
        return;
      }
      fireRef.current();
    };

    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type !== CUSTOMER_SW_REFRESH) return;
      tryPushReplay();
    };

    const onVisible = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      if (!pending.current) return;
      tryPushReplay();
    };

    navigator.serviceWorker?.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(
    () => () => {
      if (flashTimer.current !== undefined) {
        window.clearTimeout(flashTimer.current);
      }
    },
    [],
  );

  return { flash, tick };
};

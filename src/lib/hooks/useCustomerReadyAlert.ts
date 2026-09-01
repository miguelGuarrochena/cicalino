"use client";

import { useEffect, useRef, useState } from "react";
import { shouldFireCustomerAlert, shouldReplayFromPush } from "@/lib/customerAlert";
import { subscribeCustomerPushWake } from "@/lib/hooks/customerPollWake";

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
 * y otra vez en "Volver a avisar" (push del SW o avisado_en nuevo).
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
  const activeRef = useRef(active);

  useEffect(() => {
    onAlertRef.current = onAlert;
    activeRef.current = active;
    if (isWaiting) sawWaiting.current = true;
  }, [onAlert, active, isWaiting]);

  useEffect(() => {
    const play = () => {
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

    const tryPlay = () => {
      if (
        !shouldReplayFromPush({
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
      play();
    };

    if (!active || !status) return;
    const { fire: should, key } = shouldFireCustomerAlert({
      prevKey: ultimoAviso.current,
      status,
      notifiedAt,
    });
    const isFirst = ultimoAviso.current === null;
    ultimoAviso.current = key;
    if (isFirst && !sawWaiting.current) return;
    if (!should) return;
    tryPlay();
  }, [active, status, notifiedAt]);

  useEffect(() => {
    const onPush = () => {
      if (!activeRef.current) return;
      if (
        !shouldReplayFromPush({
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

    const onVisible = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      if (!pending.current) return;
      onPush();
    };

    const detach = subscribeCustomerPushWake(onPush);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      detach();
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

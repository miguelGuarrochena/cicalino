"use client";

import { useEffect, useState } from "react";

export type TabClaim = { tabId: string; at: number };

export const otherTabWins = (mine: TabClaim, other: TabClaim): boolean => {
  if (other.tabId === mine.tabId) return false;
  return (
    other.at > mine.at || (other.at === mine.at && other.tabId > mine.tabId)
  );
};

const isClaim = (v: unknown): v is TabClaim & { type: "claim" | "release" } => {
  if (!v || typeof v !== "object") return false;
  const o = v as { type?: unknown; tabId?: unknown; at?: unknown };
  if (o.type !== "claim" && o.type !== "release") return false;
  return typeof o.tabId === "string" && typeof o.at === "number";
};

/**
 * Si el mismo QR se abre en otra pestaña (reescaneo en Android, a veces
 * iPhone), la más nueva gana: es la que el cliente acaba de ver. La vieja
 * muestra el cartel de cerrar esta.
 *
 * No podemos mandar el celular a la pestaña anterior: el navegador no deja.
 */
export const useCustomerTabLock = (channel: string): boolean => {
  const [duplicate, setDuplicate] = useState(false);

  useEffect(() => {
    const mine: TabClaim = {
      tabId:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `t-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: Date.now(),
    };
    let beatenBy: string | null = null;
    const ch =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(`cicalino-tab:${channel}`)
        : null;

    const claim = () => {
      ch?.postMessage({ type: "claim", ...mine });
    };

    const onPayload = (data: unknown) => {
      if (!isClaim(data)) return;
      if (data.type === "release") {
        if (data.tabId === beatenBy) {
          beatenBy = null;
          setDuplicate(false);
          claim();
        }
        return;
      }
      if (!otherTabWins(mine, data)) return;
      beatenBy = data.tabId;
      setDuplicate(true);
    };

    const onMessage = (ev: MessageEvent) => onPayload(ev.data);
    ch?.addEventListener("message", onMessage);

    const key = `cicalino-tab:${channel}`;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || !e.newValue) return;
      try {
        onPayload(JSON.parse(e.newValue));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);

    try {
      localStorage.setItem(key, JSON.stringify({ type: "claim", ...mine }));
    } catch {
      /* quota / privado */
    }
    claim();

    const onGone = () => {
      const payload = { type: "release" as const, ...mine };
      ch?.postMessage(payload);
      try {
        localStorage.setItem(key, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pagehide", onGone);

    return () => {
      onGone();
      ch?.removeEventListener("message", onMessage);
      ch?.close();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pagehide", onGone);
    };
  }, [channel]);

  return duplicate;
};

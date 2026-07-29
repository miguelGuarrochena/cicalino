"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useEsperaStore } from "@/lib/store/espera-store";
import { useEsperaAlertsStore, staffEsperaCancelIds } from "@/lib/store/espera-alerts-store";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { isRealBranchId } from "@/lib/data/orders";
import {
  fetchTodayEsperas,
  subscribeEsperas,
} from "@/lib/data/espera";
import { dingCancelado } from "@/lib/sound";
import type { EsperaStatus } from "@/lib/types";

const POLL_MS = 4000;

const noteCancels = (
  rows: { id: string; nombre: string; estado: EsperaStatus }[],
  prev: Map<string, EsperaStatus>,
  opts: {
    toast: (msg: string, kind?: "info" | "success" | "error") => void;
    locale: string;
    pushCancel: (a: {
      id: string;
      nombre: string;
      fromGuest: boolean;
    }) => void;
  },
) => {
  for (const e of rows) {
    const before = prev.get(e.id);
    if (!before || before === "cancelado" || e.estado !== "cancelado") continue;
    const fromStaff = staffEsperaCancelIds.has(e.id);
    staffEsperaCancelIds.delete(e.id);
    opts.pushCancel({
      id: e.id,
      nombre: e.nombre,
      fromGuest: !fromStaff,
    });
    if (fromStaff) {
      opts.toast(
        opts.locale === "en"
          ? `Cancelled: ${e.nombre}`
          : `Cancelado: ${e.nombre}`,
        "info",
      );
    } else {
      dingCancelado();
      opts.toast(
        opts.locale === "en"
          ? `${e.nombre} cancelled their wait`
          : `${e.nombre} canceló la espera`,
        "error",
      );
    }
  }
};

/**
 * Escucha cancelaciones de espera en todo el panel (no solo en /panel/espera).
 * Poll cada 4s + realtime; en demo, Zustand + storage entre pestañas.
 */
export const useEsperaCancelWatch = () => {
  const { locale } = useApp();
  const toast = useToast();
  const branchId = useSessionStore((s) => s.sucursalId);
  const moduloEspera = useConfigStore((s) => s.moduloEspera);
  const pushCancel = useEsperaAlertsStore((s) => s.pushCancel);
  const live = Boolean(
    supabaseConfigurado && branchId && isRealBranchId(branchId),
  );
  const prev = useRef<Map<string, EsperaStatus>>(new Map());
  const ready = useRef(false);

  useEffect(() => {
    if (!moduloEspera || !branchId) return;

    if (!live) {
      ready.current = false;
      const apply = () => {
        const rows = useEsperaStore.getState().esperas;
        const next = new Map(rows.map((e) => [e.id, e.estado]));
        if (!ready.current) {
          prev.current = next;
          ready.current = true;
          return;
        }
        noteCancels(rows, prev.current, { toast, locale, pushCancel });
        prev.current = next;
      };
      apply();
      const unsub = useEsperaStore.subscribe(apply);
      const onStorage = (e: StorageEvent) => {
        if (e.key === "cicalino-espera-demo-v3") {
          const r = useEsperaStore.persist.rehydrate();
          if (r && typeof (r as Promise<void>).then === "function") {
            void (r as Promise<void>).then(apply);
          } else {
            apply();
          }
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        unsub();
        window.removeEventListener("storage", onStorage);
      };
    }

    ready.current = false;
    let active = true;

    const tick = async () => {
      const rows = await fetchTodayEsperas(branchId);
      if (!active) return;
      const next = new Map(rows.map((e) => [e.id, e.estado]));
      if (!ready.current) {
        prev.current = next;
        ready.current = true;
        return;
      }
      noteCancels(rows, prev.current, { toast, locale, pushCancel });
      prev.current = next;
    };

    void tick();
    const iv = window.setInterval(() => void tick(), POLL_MS);
    const unsub = subscribeEsperas(branchId, () => {
      void tick();
    }, "-cancel-watch");

    return () => {
      active = false;
      window.clearInterval(iv);
      unsub();
    };
  }, [moduloEspera, branchId, live, toast, locale, pushCancel]);
};

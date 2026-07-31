"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useWaitlistStore } from "@/lib/store/waitlist-store";
import { staffWaitlistCancelIds } from "@/lib/store/waitlist-alerts-store";
import { supabaseConfigured } from "@/lib/supabase/config";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { isRealBranchId } from "@/lib/data/orders";
import {
  fetchTodayWaitlist,
  subscribeWaitlist,
} from "@/lib/data/waitlist";
import { dingCancelled } from "@/lib/sound";
import type { WaitlistStatus } from "@/lib/types";

const POLL_MS = 15_000;

const announce = (args: {
  id: string;
  nombre: string;
  fromGuest: boolean;
  toast: (msg: string, kind?: "info" | "success" | "error") => void;
  locale: string;
  seen: Set<string>;
}) => {
  if (args.seen.has(args.id)) return;
  args.seen.add(args.id);
  if (args.fromGuest) {
    dingCancelled();
    args.toast(
      args.locale === "en"
        ? `${args.nombre} cancelled their wait`
        : `${args.nombre} canceló la espera`,
      "error",
    );
  } else {
    args.toast(
      args.locale === "en"
        ? `Cancelled: ${args.nombre}`
        : `Cancelado: ${args.nombre}`,
      "info",
    );
  }
};

export const useWaitlistCancelWatch = () => {
  const { locale } = useApp();
  const toast = useToast();
  const branchId = useSessionStore((s) => s.sucursalId);
  const moduloEspera = useConfigStore((s) => s.moduloEspera);
  const live = Boolean(
    supabaseConfigured && branchId && isRealBranchId(branchId),
  );
  const prev = useRef<Map<string, WaitlistStatus>>(new Map());
  const ready = useRef(false);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!moduloEspera || !branchId) return;

    if (!live) {
      ready.current = false;
      const apply = () => {
        const rows = useWaitlistStore.getState().esperas;
        const next = new Map(rows.map((e) => [e.id, e.estado]));
        if (!ready.current) {
          prev.current = next;
          ready.current = true;
          return;
        }
        for (const e of rows) {
          const before = prev.current.get(e.id);
          if (!before || before === "cancelado" || e.estado !== "cancelado")
            continue;
          const fromStaff = staffWaitlistCancelIds.has(e.id);
          staffWaitlistCancelIds.delete(e.id);
          announce({
            id: e.id,
            nombre: e.nombre,
            fromGuest: !fromStaff,
            toast,
            locale,
            seen: seen.current,
          });
        }
        prev.current = next;
      };
      apply();
      const unsub = useWaitlistStore.subscribe(apply);
      const onStorage = (e: StorageEvent) => {
        if (e.key === "cicalino-espera-demo-v3") {
          const r = useWaitlistStore.persist.rehydrate();
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
    const supabase = createBrowserSupabase();

    const tick = async () => {
      const rows = await fetchTodayWaitlist(branchId);
      if (!active) return;
      const next = new Map(rows.map((e) => [e.id, e.estado]));
      if (!ready.current) {
        for (const e of rows) {
          if (e.estado === "cancelado") seen.current.add(e.id);
        }
        prev.current = next;
        ready.current = true;
        return;
      }
      for (const e of rows) {
        const before = prev.current.get(e.id);
        if (!before || before === "cancelado" || e.estado !== "cancelado")
          continue;
        const fromStaff = staffWaitlistCancelIds.has(e.id);
        staffWaitlistCancelIds.delete(e.id);
        announce({
          id: e.id,
          nombre: e.nombre,
          fromGuest: !fromStaff,
          toast,
          locale,
          seen: seen.current,
        });
      }
      prev.current = next;
    };

    void tick();
    const iv = window.setInterval(() => void tick(), POLL_MS);
    const unsubPg = subscribeWaitlist(
      branchId,
      () => {
        void tick();
      },
      "-cancel-watch",
    );

    const broadcastCh = supabase
      ?.channel(`espera-cancel:${branchId}`)
      .on(
        "broadcast",
        { event: "guest-cancel" },
        (msg: { payload?: { id?: string; nombre?: string } }) => {
          const id = msg.payload?.id;
          const nombre = msg.payload?.nombre;
          if (!id || !nombre) return;
          announce({
            id,
            nombre,
            fromGuest: true,
            toast,
            locale,
            seen: seen.current,
          });
          void tick();
        },
      )
      .subscribe();

    return () => {
      active = false;
      window.clearInterval(iv);
      unsubPg.unsubscribe();
      if (supabase && broadcastCh) void supabase.removeChannel(broadcastCh);
    };
  }, [moduloEspera, branchId, live, toast, locale]);
};

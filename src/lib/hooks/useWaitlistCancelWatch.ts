"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useWaitlistStore } from "@/lib/store/waitlist-store";
import {
  staffWaitlistCancelIds,
  pushGuestCancelAlert,
} from "@/lib/store/waitlist-alerts-store";
import { supabaseConfigured } from "@/lib/supabase/config";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { isRealBranchId } from "@/lib/data/orders";
import { fetchTodayWaitlist } from "@/lib/data/waitlist";
import { dingCancelled } from "@/lib/sound";
import { attachLiveRefresh, coalesced, watchChannel } from "@/lib/realtime";
import { receptionAlerts } from "@/lib/panelAlerts";
import { publishPanelAlerts } from "@/lib/store/panel-alert-store";
import type { WaitlistStatus } from "@/lib/types";

const announce = (args: {
  id: string;
  name: string;
  fromGuest: boolean;
  toast: (msg: string, kind?: "info" | "success" | "error") => void;
  locale: string;
  seen: Set<string>;
}) => {
  if (args.seen.has(args.id)) return;
  args.seen.add(args.id);
  if (args.fromGuest) {
    /* Popup que hay que cerrar + beep: el toast solo se pierde en el mostrador. */
    dingCancelled();
    pushGuestCancelAlert({ id: args.id, name: args.name });
  } else {
    args.toast(
      args.locale === "en"
        ? `Cancelled: ${args.name}`
        : `Cancelado: ${args.name}`,
      "info",
    );
  }
};

const announceCancel = (args: {
  id: string;
  name: string;
  toast: (msg: string, kind?: "info" | "success" | "error") => void;
  locale: string;
  seen: Set<string>;
}) => {
  const fromStaff = staffWaitlistCancelIds.has(args.id);
  staffWaitlistCancelIds.delete(args.id);
  announce({
    id: args.id,
    name: args.name,
    fromGuest: !fromStaff,
    toast: args.toast,
    locale: args.locale,
    seen: args.seen,
  });
};

/* Recepción, mirada desde todo el panel.
 *
 * Este vigilante ya existía para el popup de "el cliente canceló" y ya leía la
 * lista del día cada pocos segundos desde cualquier pantalla. En vez de montar
 * una segunda suscripción para el aviso global, publica acá lo que ya tiene
 * cargado: mismo realtime, mismo poll, una lectura sola. */
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
    if (!moduloEspera || !branchId) {
      publishPanelAlerts("recepcion", []);
      return;
    }

    if (!live) {
      ready.current = false;
      const apply = () => {
        const rows = useWaitlistStore.getState().esperas;
        publishPanelAlerts("recepcion", receptionAlerts(rows));
        const next = new Map(rows.map((e) => [e.id, e.status]));
        if (!ready.current) {
          for (const e of rows) {
            if (e.status === "cancelado") seen.current.add(e.id);
          }
          prev.current = next;
          ready.current = true;
          return;
        }
        for (const e of rows) {
          if (e.status !== "cancelado" || seen.current.has(e.id)) continue;
          announceCancel({
            id: e.id,
            name: e.name,
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
        publishPanelAlerts("recepcion", []);
      };
    }

    ready.current = false;
    let active = true;
    const supabase = createBrowserSupabase();
    if (!supabase) return;

    /* Coalescido como Mesas: la acción del mozo, el evento de realtime que
     * llega por esa misma acción y el tick del poll piden lo mismo con
     * milisegundos de diferencia. Sin esto eran tres lecturas de la lista. */
    const tick = coalesced(async () => {
      const res = await fetchTodayWaitlist(branchId);
      if (!active) return;
      /* On a failed read, skip this tick rather than treating it as an empty
       * list: doing otherwise would clear `prev` and then announce every open
       * entry as newly cancelled once the connection came back. */
      if (!res.ok) return;
      const rows = res.data;
      publishPanelAlerts("recepcion", receptionAlerts(rows));
      const next = new Map(rows.map((e) => [e.id, e.status]));
      if (!ready.current) {
        for (const e of rows) {
          if (e.status === "cancelado") seen.current.add(e.id);
        }
        prev.current = next;
        ready.current = true;
        return;
      }
      /* Cualquier cancelado nuevo (no visto) cuenta, aunque no estuviera en
       * `prev` — el filtro viejo con `before` se comía cancelaciones reales. */
      for (const e of rows) {
        if (e.status !== "cancelado" || seen.current.has(e.id)) continue;
        announceCancel({
          id: e.id,
          name: e.name,
          toast,
          locale,
          seen: seen.current,
        });
      }
      prev.current = next;
    });

    /* La suscripción, con la forma que pide `attachLiveRefresh`: el poll de
     * respaldo se espacia solo cuando el canal está sano. */
    const subscribe = (onChange: () => void) => {
      /* Camino rápido: el UPDATE de postgres trae nombre/estado sin esperar el fetch. */
      let pgWatcher: { state: { healthy: boolean }; dispose: () => void } | null =
        null;
      let pgChannel: ReturnType<typeof supabase.channel> | null = null;
      const connectPg = () => {
        if (!active) return;
        if (pgChannel) void supabase.removeChannel(pgChannel);
        pgWatcher?.dispose();
        pgChannel = supabase
          .channel(`espera-cancel-pg:${branchId}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "esperas",
              filter: `local_id=eq.${branchId}`,
            },
            (payload) => {
              const row = payload.new as {
                id?: string;
                nombre?: string;
                estado?: string;
              };
              if (!row?.id || !row.nombre || row.estado !== "cancelado") return;
              announceCancel({
                id: row.id,
                name: row.nombre,
                toast,
                locale,
                seen: seen.current,
              });
              onChange();
            },
          )
          /* Un alta nueva no es una cancelación, pero sí una novedad: en vez de
           * esperar al poll, el mismo canal la trae al toque. */
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "esperas",
              filter: `local_id=eq.${branchId}`,
            },
            onChange,
          );
        pgWatcher = watchChannel(pgChannel, connectPg, onChange);
      };
      connectPg();

      const broadcastCh = supabase
        .channel(`espera-cancel:${branchId}`)
        .on(
          "broadcast",
          { event: "guest-cancel" },
          (msg: { payload?: { id?: string; name?: string } }) => {
            const id = msg.payload?.id;
            const name = msg.payload?.name;
            if (!id || !name) return;
            announceCancel({
              id,
              name,
              toast,
              locale,
              seen: seen.current,
            });
            onChange();
          },
        )
        .subscribe();

      return {
        unsubscribe: () => {
          pgWatcher?.dispose();
          if (pgChannel) void supabase.removeChannel(pgChannel);
          void supabase.removeChannel(broadcastCh);
        },
        /* La salud del canal de filas es la que decide cada cuánto refrescar.
         * El de broadcast es un extra del comensal: si se cae, las
         * cancelaciones siguen llegando por postgres. */
        isHealthy: () => pgWatcher?.state.healthy ?? false,
      };
    };

    /* Mismo respaldo que Pedidos y Mesas: cada 20 s con el canal sano y cada
     * 5 s si se cayó, pausado con la pestaña atrás y con refresco al volver
     * por visibilidad, foco o red. Antes era un intervalo fijo de 5 s que
     * corría igual con realtime sano —doce lecturas por minuto y por tablet,
     * todo el servicio— y sin refresco al volver a la pestaña. */
    const stopLive = attachLiveRefresh({
      subscribe,
      reload: () => void tick(),
      ticksSano: 4,
    });
    void tick();

    return () => {
      active = false;
      stopLive();
      publishPanelAlerts("recepcion", []);
    };
  }, [moduloEspera, branchId, live, toast, locale]);
};

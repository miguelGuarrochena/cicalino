"use client";

import { useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/config";
import {
  useSessionStore,
  type CurrentRole,
} from "@/lib/store/session-store";

type PerfilRow = {
  rol: string;
  organizacion_id: string | null;
  local_id: string | null;
};

const aplicarPerfil = (row: PerfilRow | null) => {
  if (!row) return;
  const s = useSessionStore.getState();
  if (s.impersonando) return;

  const rol = (row.rol as CurrentRole) || "admin";
  useSessionStore.setState({
    rol,
    organizationId: row.organizacion_id,
    sucursalId:
      rol === "admin" &&
      s.organizationId === row.organizacion_id &&
      s.sucursalId
        ? s.sucursalId
        : row.local_id,
  });
};

const cargarPerfil = async (userId: string) => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const { data } = await supabase
    .from("usuarios")
    .select("rol, organizacion_id, local_id")
    .eq("id", userId)
    .maybeSingle();
  aplicarPerfil(data as PerfilRow | null);
};

export const useAuthSessionSync = () => {
  useEffect(() => {
    if (!supabaseConfigured) return;

    let alive = true;
    let started = false;
    let unsubscribeAuth: (() => void) | undefined;

    const start = () => {
      if (started || !alive) return;
      started = true;
      const supabase = createBrowserSupabase();
      if (!supabase) return;

      void (async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!alive) return;
        if (session?.user) {
          await cargarPerfil(session.user.id);
        }
      })();

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (!alive) return;
        if (event === "SIGNED_OUT") {
          useSessionStore.setState({
            organizationId: null,
            sucursalId: null,
            empleadoActivo: null,
            impersonando: null,
          });
          return;
        }
        if (
          session?.user &&
          (event === "SIGNED_IN" ||
            event === "TOKEN_REFRESHED" ||
            event === "INITIAL_SESSION" ||
            event === "USER_UPDATED")
        ) {
          void cargarPerfil(session.user.id);
        }
      });

      unsubscribeAuth = () => subscription.unsubscribe();
    };

    const unsubHydration = useSessionStore.persist.onFinishHydration(() => {
      start();
    });

    if (useSessionStore.persist.hasHydrated()) {
      start();
    }

    return () => {
      alive = false;
      unsubHydration();
      unsubscribeAuth?.();
    };
  }, []);
};

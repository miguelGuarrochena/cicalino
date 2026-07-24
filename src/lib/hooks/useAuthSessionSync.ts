"use client";

import { useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { supabaseConfigurado } from "@/lib/supabase/config";
import {
  useSessionStore,
  type CurrentRole,
} from "@/lib/store/session-store";

type PerfilRow = {
  rol: string;
  organizacion_id: string | null;
  local_id: string | null;
};

/** Aplica el perfil de `usuarios` al store de sesión (sin tocar impersonación). */
const aplicarPerfil = (row: PerfilRow | null) => {
  if (!row) return;
  const s = useSessionStore.getState();
  // Si el SA está impersonando, no pisar el contexto local.
  if (s.impersonando) return;

  const rol = (row.rol as CurrentRole) || "admin";
  useSessionStore.setState({
    rol,
    organizacionId: row.organizacion_id,
    // Dueño: conservar sucursal elegida si sigue en la misma org.
    sucursalId:
      rol === "admin" &&
      s.organizacionId === row.organizacion_id &&
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

/**
 * Mantiene la sesión del panel alineada con Supabase Auth.
 * Corre después de rehydrate del store para no pisar ni ser pisado.
 * Ir a la landing o matar la app no limpia la cookie ni el perfil.
 */
export const useAuthSessionSync = () => {
  useEffect(() => {
    if (!supabaseConfigurado) return;

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
            organizacionId: null,
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

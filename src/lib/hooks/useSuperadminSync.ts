"use client";

import { useEffect, useState } from "react";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { refreshOrganizations } from "@/lib/data/superadmin";

// Carga orgs al entrar a /admin y se mantiene al día (aceptación de
// condiciones, cambios de cupo, etc.) vía realtime + poll de respaldo.
export const useSuperadminSync = (): { ready: boolean } => {
  const [ready, setReady] = useState(!supabaseConfigurado);

  useEffect(() => {
    if (!supabaseConfigurado) return;

    let alive = true;
    void (async () => {
      await refreshOrganizations();
      if (alive) setReady(true);
    })();

    const supabase = createBrowserSupabase();
    if (!supabase) {
      setReady(true);
      return;
    }

    const channel = supabase
      .channel("superadmin-orgs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "organizaciones" },
        () => {
          void refreshOrganizations();
        },
      )
      .subscribe();

    const poll = window.setInterval(() => {
      void refreshOrganizations();
    }, 12_000);

    return () => {
      alive = false;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, []);

  return { ready };
};

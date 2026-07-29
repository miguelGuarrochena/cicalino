"use client";

import { useEffect } from "react";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { refreshOrganizations } from "@/lib/data/superadmin";

// Carga orgs al entrar a /admin y se mantiene al día (aceptación de
// condiciones, cambios de cupo, etc.) vía realtime + poll de respaldo.
export const useSuperadminSync = (): void => {
  useEffect(() => {
    if (!supabaseConfigurado) return;

    void refreshOrganizations();

    const supabase = createBrowserSupabase();
    if (!supabase) return;

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

    // Respaldo si realtime no está habilitado en la tabla.
    const poll = window.setInterval(() => {
      void refreshOrganizations();
    }, 12_000);

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, []);
};

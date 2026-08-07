"use client";

import { useEffect, useState } from "react";
import { supabaseConfigured } from "@/lib/supabase/config";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { refreshOrganizations } from "@/lib/data/superadmin";

export const useSuperadminSync = (): { ready: boolean } => {
  const [ready, setReady] = useState(!supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;

    let alive = true;
    void (async () => {
      await refreshOrganizations();
      if (alive) setReady(true);
    })();

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

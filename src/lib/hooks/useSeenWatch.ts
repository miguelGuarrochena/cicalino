"use client";

import { useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";

const POLL_MS = 1_200;

const TABLE = {
  order: "pedidos",
  waitlist: "esperas",
} as const;

export const useSeenWatch = (
  kind: keyof typeof TABLE,
  id: string | null,
  onSeen: () => void,
): void => {
  useEffect(() => {
    if (!id) return;
    const supabase = createBrowserSupabase();
    if (!supabase) return;

    let active = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const { data } = await supabase
        .from(TABLE[kind])
        .select("visto_en")
        .eq("id", id)
        .maybeSingle();
      if (!active) return;
      if ((data as { visto_en: string | null } | null)?.visto_en) onSeen();
    };

    const iv = window.setInterval(() => void check(), POLL_MS);
    return () => {
      active = false;
      window.clearInterval(iv);
    };
  }, [kind, id, onSeen]);
};

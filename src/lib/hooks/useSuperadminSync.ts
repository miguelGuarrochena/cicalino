"use client";

import { useEffect } from "react";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { refreshOrganizations } from "@/lib/data/superadmin";

// Carga las organizaciones de la base en el store cuando hay backend.
// Solo el superadmin llega a /admin (gate en el layout), y RLS lo deja ver todo.
export const useSuperadminSync = (): void => {
  useEffect(() => {
    if (!supabaseConfigurado) return;
    void refreshOrganizations();
  }, []);
};

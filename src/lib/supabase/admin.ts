import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

// Cliente con service_role (SOLO server). Saltea RLS: usarlo únicamente para
// operaciones del superadmin (alta de organizaciones, invitar admins, leer un
// pedido por token para la vista pública del cliente). NUNCA en el navegador.
export const createAdminSupabase = () => {
  // "secret" es el nombre nuevo de Supabase para la clave service_role.
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";
  if (!SUPABASE_URL || !key) return null;
  return createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

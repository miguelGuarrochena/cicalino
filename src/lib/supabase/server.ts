import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from "./config";

type CookieItem = { name: string; value: string; options?: CookieOptions };

// Cliente de Supabase para el server (RSC, route handlers, server actions).
// Maneja la sesión por cookies. Devuelve null si no está configurado.
export const createServerSupabase = async () => {
  if (!supabaseConfigurado) return null;
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list: CookieItem[]) => {
        try {
          list.forEach(({ name, value, options }) =>
            cookieStore.set({ name, value, ...options }),
          );
        } catch {
          // En un RSC no se pueden setear cookies; lo maneja el middleware.
        }
      },
    },
  });
};

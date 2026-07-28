// Config de Supabase. Sin URL/anon key: en desarrollo corre "modo demo"
// (Zustand). En producción el middleware bloquea /panel y /admin.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Supabase renombró las claves: "publishable" reemplaza a "anon" (ambas son
// seguras para el navegador). Aceptamos las dos por compatibilidad.
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export const supabaseConfigurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

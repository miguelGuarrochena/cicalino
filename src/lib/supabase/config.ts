// Config de Supabase. Si falta la URL/anon key, la app corre en "modo demo"
// (sin auth ni base): los stores de Zustand siguen funcionando como hasta ahora.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Supabase renombró las claves: "publishable" reemplaza a "anon" (ambas son
// seguras para el navegador). Aceptamos las dos por compatibilidad.
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export const supabaseConfigurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

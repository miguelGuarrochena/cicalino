"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from "./config";

// Cliente de Supabase para el navegador (componentes client).
// Devuelve null si Supabase no está configurado (modo demo).
export const createBrowserSupabase = () =>
  supabaseConfigurado
    ? createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

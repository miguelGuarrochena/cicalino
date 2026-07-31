"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigured } from "./config";

export const createBrowserSupabase = () =>
  supabaseConfigured
    ? createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

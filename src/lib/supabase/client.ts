"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigured } from "./config";
import { fetchWithJwtSkewRetry } from "./jwtSkewRetry";

export const createBrowserSupabase = () =>
  supabaseConfigured
    ? createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { fetch: fetchWithJwtSkewRetry },
      })
    : null;

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { translate, type Locale } from "@/lib/i18n";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useSuperadminStore } from "@/lib/store/superadmin-store";
import { useOrdersStore } from "@/lib/store/orders-store";

type ThemePref = "light" | "dark" | "system";

interface Ctx {
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  cycleTheme: () => void;
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const AppContext = createContext<Ctx | null>(null);

const applyTheme = (theme: ThemePref) => {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
};

export const Providers = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<ThemePref>("system");
  const [locale, setLocaleState] = useState<Locale>("es");

  useEffect(() => {
    const st = (localStorage.getItem("cicalino-theme") as ThemePref) || "system";
    const sl = (localStorage.getItem("cicalino-lang") as Locale) || "es";
    setThemeState(st);
    setLocaleState(sl);
    applyTheme(st);
    // Rehidratar stores persistidos despues del montaje (evita mismatch de SSR).
    useConfigStore.persist.rehydrate();
    useSessionStore.persist.rehydrate();
    useSuperadminStore.persist.rehydrate();
    useOrdersStore.persist.rehydrate();
    // PWA: registrar el service worker (solo en producción).
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    localStorage.setItem("cicalino-theme", t);
    applyTheme(t);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemePref =
        prev === "light" ? "dark" : prev === "dark" ? "system" : "light";
      localStorage.setItem("cicalino-theme", next);
      applyTheme(next);
      return next;
    });
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("cicalino-lang", l);
    document.documentElement.lang = l === "es" ? "es-AR" : "en";
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  );

  return (
    <AppContext.Provider
      value={{ theme, setTheme, cycleTheme, locale, setLocale, t }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): Ctx => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp debe usarse dentro de <Providers>");
  return ctx;
};

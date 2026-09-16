"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { InstallButton } from "@/components/pwa/InstallButton";
import { signOut } from "@/lib/auth/actions";
import { clearSessionLocal } from "@/lib/store/session-store";
import type { Locale } from "@/lib/i18n";
import Link from "next/link";

export const PanelMenu = () => {
  const { t, locale, setLocale } = useApp();
  const { canManage } = useOperationalAccess();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const onConfig = path.startsWith("/panel/config") || path.startsWith("/panel/metrics");

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const salir = async () => {
    clearSessionLocal();
    await signOut();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={locale === "en" ? "More" : "Más opciones"}
        aria-expanded={open}
        className="flex size-9 items-center justify-center rounded-full border border-linea text-carbon/70 transition hover:bg-carbon/5"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-2xl border border-linea bg-surface p-2 shadow-xl">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-semibold text-carbon/50">
              {locale === "en" ? "Language" : "Idioma"}
            </span>
            <div className="flex overflow-hidden rounded-full border border-linea">
              {(["es", "en"] as Locale[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLocale(l)}
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase transition ${
                    locale === l ? "bg-marca text-crema" : "text-carbon/55"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <InstallButton className="mt-1 w-full justify-center" />

          {canManage && (
            <Link
              href="/panel/config"
              onClick={() => setOpen(false)}
              className={`mt-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm transition hover:bg-carbon/5 ${
                onConfig ? "font-semibold text-marca" : "text-carbon"
              }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              {t("nav.config")}
            </Link>
          )}

          <Link
            href="/panel/ayuda"
            onClick={() => setOpen(false)}
            className="mt-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-carbon transition hover:bg-carbon/5"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {locale === "en" ? "Help" : "Ayuda"}
          </Link>

          <div className="my-1 border-t border-linea" />

          <button
            type="button"
            onClick={salir}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {locale === "en" ? "Log out" : "Cerrar sesión"}
          </button>
        </div>
      )}
    </div>
  );
};

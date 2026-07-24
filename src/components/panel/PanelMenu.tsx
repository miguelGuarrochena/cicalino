"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { InstallButton } from "@/components/pwa/InstallButton";
import { signOut } from "@/lib/auth/actions";
import { useSessionStore } from "@/lib/store/session-store";
import type { Locale } from "@/lib/i18n";

// Menú "···" del panel: agrupa lo secundario (idioma, tema, instalar, salir)
// para no saturar el header. Lo operativo (fichaje, sonido, sucursal) queda
// visible, y la navegación importante vive en la barra de abajo (mobile).
export const PanelMenu = () => {
  const { theme, cycleTheme, locale, setLocale } = useApp();
  const [open, setOpen] = useState(false);

  const salir = async () => {
    try {
      useSessionStore.persist.clearStorage();
    } catch {
      /* sin storage */
    }
    await signOut();
  };

  return (
    <div className="relative">
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
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
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

            <button
              type="button"
              onClick={cycleTheme}
              className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-sm text-carbon transition hover:bg-carbon/5"
            >
              <span>{locale === "en" ? "Theme" : "Tema"}</span>
              <span className="text-xs capitalize text-carbon/50">{theme}</span>
            </button>

            <InstallButton className="mt-1 w-full justify-center" />

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
        </>
      )}
    </div>
  );
};

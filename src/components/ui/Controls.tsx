"use client";

import { useApp } from "@/components/providers/Providers";
import type { Locale } from "@/lib/i18n";

const IconSun = () => {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </svg>
  );
};
const IconMoon = () => {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
};
const IconSystem = () => {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
};

// Cluster de controles: idioma (ES/EN) + tema (claro/oscuro/sistema).
export const Controls = ({ className = "" }: { className?: string }) => {
  const { theme, cycleTheme, locale, setLocale } = useApp();

  return (
    <div className={`flex items-center gap-1.5 sm:gap-2 ${className}`}>
      <div className="flex overflow-hidden rounded-full border border-linea bg-surface/70 backdrop-blur">
        {(["es", "en"] as Locale[]).map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            aria-pressed={locale === l}
            className={`px-2 py-1.5 text-[10px] font-bold uppercase transition sm:px-3 sm:text-xs ${
              locale === l
                ? "bg-marca text-crema"
                : "text-carbon/55 hover:text-carbon"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      <button
        onClick={cycleTheme}
        aria-label="Cambiar tema"
        title={theme}
        className="flex size-8 items-center justify-center rounded-full border border-linea bg-surface/70 text-carbon backdrop-blur transition hover:bg-carbon/5 active:scale-95 sm:size-9"
      >
        {theme === "light" ? (
          <IconSun />
        ) : theme === "dark" ? (
          <IconMoon />
        ) : (
          <IconSystem />
        )}
      </button>
    </div>
  );
};

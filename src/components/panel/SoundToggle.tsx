"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { isSoundMuted, setSoundMuted } from "@/lib/sound";

// Silenciar / activar el sonido de avisos del mostrador.
export const SoundToggle = () => {
  const { locale } = useApp();
  const [muted, setMuted] = useState(false);

  useEffect(() => setMuted(isSoundMuted()), []);

  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  };

  const label = muted
    ? locale === "en"
      ? "Unmute alerts"
      : "Activar sonido"
    : locale === "en"
      ? "Mute alerts"
      : "Silenciar";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-full border border-linea bg-surface/70 text-carbon backdrop-blur transition hover:bg-carbon/5"
    >
      {muted ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H2v6h4l5 4V5z" />
          <path d="M23 9l-6 6M17 9l6 6" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H2v6h4l5 4V5z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
        </svg>
      )}
    </button>
  );
};

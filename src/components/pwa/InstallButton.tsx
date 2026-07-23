"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Botón "Instalar app". Solo aparece si el navegador dispara beforeinstallprompt
// (Chrome/Edge en Android y escritorio) y la app aún no está instalada.
export const InstallButton = ({ className = "" }: { className?: string }) => {
  const { locale } = useApp();
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setEvt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!evt) return null;

  const instalar = async () => {
    await evt.prompt();
    await evt.userChoice;
    setEvt(null);
  };

  return (
    <button
      type="button"
      onClick={instalar}
      className={`flex items-center gap-1.5 rounded-full border border-marca/40 bg-marca/10 px-3 py-1.5 text-xs font-semibold text-marca transition hover:bg-marca/15 ${className}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
      </svg>
      {locale === "en" ? "Install" : "Instalar"}
    </button>
  );
};

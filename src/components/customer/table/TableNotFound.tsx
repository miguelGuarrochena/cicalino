"use client";

import { useApp } from "@/components/providers/Providers";
import { Controls } from "@/components/ui/Controls";
import { ThemedImg } from "@/components/ui/ThemedImg";

export const TableNotFound = ({
  reason = "not-found",
}: {
  reason?: "not-found" | "not-available" | "not-configured";
}) => {
  const { t } = useApp();
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-14 text-center">
      <Controls showTheme={false} className="absolute right-4 top-4" />
      <ThemedImg name="bell" alt="" className="h-28 opacity-50" />
      <p className="mt-6 font-display text-2xl uppercase text-carbon">
        {t(reason === "not-available" ? "mesa.noDisponibleTitulo" : "mesa.noEncontradaTitulo")}
      </p>
      <p className="mt-2 max-w-sm text-base leading-relaxed text-suave">
        {t(reason === "not-available" ? "mesa.noDisponible" : "mesa.noEncontradaSub")}
      </p>
    </main>
  );
};

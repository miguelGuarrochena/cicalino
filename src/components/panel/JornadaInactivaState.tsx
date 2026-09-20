"use client";

import type { ReactNode } from "react";
import { useApp } from "@/components/providers/Providers";
import { EmptyState } from "@/components/ui/EmptyState";

/* Local cerrado: no hay jornada activa. El CTA lo pone cada pantalla —
 * Pedidos no tiene historial, Recepción ofrece cargar una reserva, Pagos
 * manda al historial de mesas cerradas. */
export const JornadaInactivaState = ({ action }: { action?: ReactNode }) => {
  const { t } = useApp();

  return (
    <EmptyState
      title={t("panel.jornadaInactivaTitulo")}
      body={t("panel.jornadaInactivaBody")}
      action={action}
    />
  );
};

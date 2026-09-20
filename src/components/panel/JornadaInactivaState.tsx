"use client";

import type { ReactNode } from "react";
import { useApp } from "@/components/providers/Providers";
import { EmptyState } from "@/components/ui/EmptyState";

/* Local cerrado: no hay jornada activa. El CTA lo pone cada pantalla —
 * Pedidos no tiene historial, el hub manda a gestionar reservas, Pagos
 * manda al historial de mesas cerradas. En Recepción no hace falta botón:
 * la agenda ya está abajo. */
export const JornadaInactivaState = ({
  action,
  body,
}: {
  action?: ReactNode;
  body?: string;
}) => {
  const { t } = useApp();

  return (
    <EmptyState
      title={t("panel.jornadaInactivaTitulo")}
      body={body ?? t("panel.jornadaInactivaBody")}
      action={action}
    />
  );
};

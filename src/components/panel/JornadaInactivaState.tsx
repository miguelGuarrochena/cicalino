"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/Providers";
import { EmptyState } from "@/components/ui/EmptyState";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";

/* Local cerrado: no hay jornada activa. Historial sí, operación no. */
export const JornadaInactivaState = () => {
  const { t } = useApp();
  const { visibles } = useOperationalAccess();
  const historial = visibles.pagos ? "/panel/pagos/historial" : undefined;

  return (
    <EmptyState
      title={t("panel.jornadaInactivaTitulo")}
      body={t("panel.jornadaInactivaBody")}
      action={
        historial ? (
          <Link
            href={historial}
            className="inline-flex min-h-10 items-center text-sm font-semibold text-marca underline-offset-4 hover:underline"
          >
            {t("panel.jornadaInactivaHistorial")}
          </Link>
        ) : undefined
      }
    />
  );
};

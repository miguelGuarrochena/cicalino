"use client";

import { useSyncExternalStore } from "react";
import { useApp } from "@/components/providers/Providers";
import { iosPushNeedsHomeScreen } from "@/lib/notifications";

/* Avisos en iPhone: Safari solo los manda si la página se agregó a la
 * pantalla de inicio y se abre desde ahí. Se muestra únicamente cuando hace
 * falta (iosPushNeedsHomeScreen): nunca en Android ni en escritorio, ni en
 * Chrome de iPhone, que no tiene esa opción. Va plegado: es opcional y no
 * tiene que tapar el estado del pedido.
 *
 * `children` es lo que sigue después de agregarla (p. ej. un botón que abre
 * el link del pedido, cuando la pantalla actual no es ese link). */

const noSubscribe = () => () => {};

export const IosPushSteps = ({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) => {
  const { t } = useApp();
  const show = useSyncExternalStore(noSubscribe, iosPushNeedsHomeScreen, () => false);
  if (!show) return null;
  return (
    <details className={`rounded-2xl border border-linea bg-surface p-4 text-sm text-suave ${className}`}>
      <summary className="cursor-pointer text-base font-semibold text-carbon">
        {t("iosAvisos.titulo")}
      </summary>
      <p className="mt-2">{t("iosAvisos.intro")}</p>
      {children}
      <ol className="mt-3 flex flex-col gap-2">
        {[1, 2, 3, 4].map((n) => (
          <li key={n} className="flex items-start gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-marca/10 text-sm font-bold text-marca">
              {n}
            </span>
            <span className="leading-snug text-carbon">{t(`iosAvisos.paso${n}`)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3">{t("iosAvisos.nota")}</p>
    </details>
  );
};

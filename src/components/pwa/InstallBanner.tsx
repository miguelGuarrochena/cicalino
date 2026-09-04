"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { useBrowserValue } from "@/lib/hooks/useBrowserValue";
import { usePwaInstall } from "@/lib/hooks/usePwaInstall";
import {
  INSTALL_IOS_DELAY_MS,
  dismissActivo,
  marcarDismiss,
} from "@/lib/pwaInstall";

const IconoInstalar = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
  </svg>
);

const Paso = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex items-start gap-3">
    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-marca/10 text-xs font-bold text-marca">
      {n}
    </span>
    <span className="leading-snug text-carbon/75">{children}</span>
  </li>
);

/**
 * El recordatorio de instalar la app, abajo de todo.
 *
 * Solo aparece dentro del panel, así que quien lo ve ya está logueado. Las
 * tres condiciones para mostrarlo son: que no esté ya instalada, que el
 * navegador tenga cómo instalarla y que no lo hayan descartado hace poco.
 *
 * En mobile se apoya arriba de la barra de navegación de abajo en vez de
 * taparla; en pantalla grande se va al rincón derecho y no molesta a nadie.
 */
export const InstallBanner = () => {
  const { t } = useApp();
  const { instalada, promptDisponible, iosManual, instalar } = usePwaInstall();
  const [descartado, setDescartado] = useState(false);
  const [ayudaIOS, setAyudaIOS] = useState(false);
  const [iosEnTiempo, setIosEnTiempo] = useState(false);

  /* En el servidor y en el primer render del cliente da `true`: el aviso
   * arranca oculto y aparece recién cuando sabemos que corresponde. Leerlo en
   * un efecto sería el mismo dato un render más tarde, y con parpadeo. */
  const enfriamiento = useBrowserValue(dismissActivo, true);

  useEffect(() => {
    if (!iosManual) return;
    const id = window.setTimeout(
      () => setIosEnTiempo(true),
      INSTALL_IOS_DELAY_MS,
    );
    return () => window.clearTimeout(id);
  }, [iosManual]);

  const visible =
    !instalada &&
    !descartado &&
    !enfriamiento &&
    (promptDisponible || (iosManual && iosEnTiempo));

  const descartar = () => {
    marcarDismiss();
    setAyudaIOS(false);
    setDescartado(true);
  };

  const alInstalar = async () => {
    const salida = await instalar();
    if (salida === "manual") {
      setAyudaIOS(true);
      return;
    }
    /* Aceptó: el aviso ya no tiene sentido, pero no lo enfriamos —si la
     * instalación se cae a mitad de camino, que lo pueda volver a intentar en
     * la próxima carga. Rechazó: es un "ahora no" tan válido como la X. */
    if (salida !== "accepted") marcarDismiss();
    setDescartado(true);
  };

  if (!visible) return null;

  return (
    <>
      <aside
        aria-label={t("instalar.titulo")}
        className="u-pop fixed inset-x-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[22rem]"
      >
        <div className="flex items-start gap-3 rounded-2xl border border-linea bg-surface/95 p-3.5 shadow-xl backdrop-blur-md">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-marca/10 text-marca">
            <IconoInstalar />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-carbon">
              {t("instalar.titulo")}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-carbon/60">
              {t("instalar.desc")}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={alInstalar}
                className="rounded-full bg-marca px-4 py-1.5 text-xs font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
              >
                {t("instalar.instalar")}
              </button>
              <button
                type="button"
                onClick={descartar}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-carbon/60 transition hover:bg-carbon/5"
              >
                {t("instalar.luego")}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={descartar}
            aria-label={t("instalar.cerrar")}
            className="-mr-1 -mt-1 flex size-7 shrink-0 items-center justify-center rounded-full text-carbon/40 transition hover:bg-carbon/5 hover:text-carbon"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </aside>

      {ayudaIOS && (
        <ModalShell onClose={() => setAyudaIOS(false)} labelledBy="instalar-ios">
          <div className="flex items-start justify-between gap-3">
            <h2
              id="instalar-ios"
              className="text-lg font-semibold text-carbon"
            >
              {t("instalar.iosTitulo")}
            </h2>
            <ModalCloseBtn
              onClick={() => setAyudaIOS(false)}
              label={t("instalar.cerrar")}
            />
          </div>

          <ol className="mt-4 space-y-3 text-sm">
            <Paso n={1}>
              {t("instalar.iosPaso1a")}{" "}
              <strong className="text-carbon">
                {t("instalar.iosCompartir")}
              </strong>{" "}
              {t("instalar.iosPaso1b")}
            </Paso>
            <Paso n={2}>
              {t("instalar.iosPaso2a")}{" "}
              <strong className="text-carbon">
                {t("instalar.iosPaso2Opcion")}
              </strong>{" "}
              {t("instalar.iosPaso2b")}
            </Paso>
            <Paso n={3}>
              {t("instalar.iosPaso3a")}{" "}
              <strong className="text-carbon">
                {t("instalar.iosPaso3Boton")}
              </strong>{" "}
              {t("instalar.iosPaso3b")}
            </Paso>
          </ol>

          <p className="mt-4 text-xs text-carbon/55">
            {t("instalar.iosNota")}
          </p>
        </ModalShell>
      )}
    </>
  );
};

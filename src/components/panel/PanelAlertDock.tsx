"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { usePanelAlerts } from "@/lib/hooks/usePanelAlerts";
import { ackPanelAlerts } from "@/lib/store/panel-alert-store";
import {
  ALERT_META,
  alertIsElsewhere,
  type PanelAlert,
  type PanelAlertKind,
} from "@/lib/panelAlerts";

/* El aviso que se ve desde cualquier pantalla del panel.
 *
 * No reemplaza a ninguna bandeja: Mesas sigue mostrando su cola, Pedidos la
 * suya y Recepción la suya. Esto es solo el golpecito en el hombro para el que
 * está en otra pantalla, con el link a la sección que tiene el detalle.
 *
 * Por eso no aparece sobre la sección de la que salió la novedad: ahí la
 * pantalla ya la está mostrando, y dos avisos de lo mismo encima se leen peor
 * que uno.
 *
 * El diseño acá es a propósito ruidoso. En hora pico el mozo mira la tablet de
 * reojo entre mesa y mesa: gana que se vea, no que quede prolijo. */

const MAX_VISIBLE = 3;

const TONE: Record<PanelAlertKind, { card: string; halo: string; chip: string }> = {
  llamado: {
    card: "border-alerta-borde bg-alerta-fondo text-alerta",
    halo: "u-alert-halo",
    chip: "bg-alerta text-crema",
  },
  cuenta: {
    card: "border-curso-borde bg-curso-fondo text-curso",
    halo: "u-alert-halo u-alert-halo-curso",
    chip: "bg-curso text-crema",
  },
  "pedido-mesa": {
    card: "border-marca bg-marca/10 text-marca",
    halo: "u-alert-halo u-alert-halo-marca",
    chip: "bg-marca text-crema",
  },
  "mp-pagado": {
    card: "border-ok-borde bg-ok-fondo text-ok",
    halo: "u-alert-halo u-alert-halo-ok",
    chip: "bg-ok text-crema",
  },
  "pedido-mostrador": {
    card: "border-marca bg-marca/10 text-marca",
    halo: "u-alert-halo u-alert-halo-marca",
    chip: "bg-marca text-crema",
  },
  "espera-nueva": {
    card: "border-espera bg-espera/10 text-espera",
    halo: "u-alert-halo u-alert-halo-marca",
    chip: "bg-espera text-crema",
  },
};

const SOURCE_KEY = {
  mesas: "nav.pagos",
  pedidos: "nav.pedidos",
  recepcion: "nav.espera",
} as const;

export const PanelAlertDock = () => {
  const { t } = useApp();
  const path = usePathname();
  const alerts = usePanelAlerts();
  const [abierto, setAbierto] = useState(false);
  const afuera = alerts.filter((a) => alertIsElsewhere(a, path));

  if (!afuera.length) return null;

  /* Desplegar la cola es mirar, no atender. Antes este botón daba por vistas
   * todas las que no entraban: con seis mesas gritando, un toque apagaba
   * cuatro que nadie había leído. Ahora lo único que marca visto es abrir la
   * alerta o descartarla de a una. */
  const visibles = abierto ? afuera : afuera.slice(0, MAX_VISIBLE);
  const enCola = afuera.length - visibles.length;

  return (
    <div
      role="region"
      aria-live="assertive"
      aria-label={t("alertas.titulo")}
      className="fixed inset-x-3 bottom-[5.5rem] z-[210] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[22rem] print:hidden"
    >
      {/* Cuánto hay en total, siempre, esté desplegado o no: el mozo tiene que
          poder contar de un vistazo sin abrir nada. */}
      {afuera.length > MAX_VISIBLE && (
        <p className="self-end rounded-full bg-carbon px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-crema shadow-lg">
          {t("alertas.pendientesN", { n: afuera.length })}
        </p>
      )}
      <div
        className={`flex flex-col items-stretch gap-2 ${
          abierto ? "max-h-[60vh] overflow-y-auto overscroll-contain u-scroll pr-0.5" : ""
        }`}
      >
        {visibles.map((a) => (
          <AlertCard key={a.id} alert={a} />
        ))}
      </div>
      {afuera.length > MAX_VISIBLE && (
        <button
          type="button"
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
          className="min-h-11 self-end rounded-full bg-carbon/90 px-4 text-xs font-semibold text-crema shadow-lg backdrop-blur transition hover:bg-carbon"
        >
          {abierto ? t("alertas.verMenos") : t("alertas.verLasN", { n: enCola })}
        </button>
      )}
    </div>
  );
};

const AlertCard = ({ alert }: { alert: PanelAlert }) => {
  const { t } = useApp();
  const meta = ALERT_META[alert.kind];
  const tone = TONE[alert.kind];
  const dato = alert.table != null ? String(alert.table) : (alert.label ?? "");
  const titulo = t(meta.titleKey, { n: dato });

  return (
    <div
      className={`u-alert-beat ${tone.halo} flex items-center gap-3 rounded-2xl border-2 p-3 shadow-2xl backdrop-blur ${tone.card}`}
    >
      <Link
        href={alert.href}
        onClick={() => ackPanelAlerts([alert])}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span aria-hidden className="text-3xl leading-none">
          {meta.icon}
        </span>
        <span className="min-w-0">
          {/* Sin recortar: "Mesa 3 pidió la cuenta" cortado en "Mesa 3 pidió
              la cue…" obliga a entrar para saber qué pasa, que es justo lo que
              este aviso viene a evitar. */}
          <span className="block font-display text-lg uppercase leading-tight tracking-tight">
            {titulo}
          </span>
          <span
            className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.chip}`}
          >
            {t(SOURCE_KEY[alert.source])}
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => ackPanelAlerts([alert])}
        aria-label={t("alertas.visto")}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-carbon/10 text-current transition hover:bg-carbon/20"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

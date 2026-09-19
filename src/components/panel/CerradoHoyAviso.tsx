"use client";

import { useApp } from "@/components/providers/Providers";
import { useConfigStore } from "@/lib/store/config-store";
import {
  businessDayStart,
  weekdayInTz,
  TZ_NEGOCIO,
} from "@/lib/businessDay";
import { isClosedWeekday } from "@/lib/closedDays";

/* Hoy es un día cerrado y la pantalla sigue mostrando la jornada anterior.
 *
 * Sin este aviso la sala del lunes es idéntica a la del domingo y nadie sabe
 * si está viendo lo de anoche o algo que pasó recién. Dice qué jornada tiene
 * delante; no bloquea nada, porque un local cerrado igual cobra una cuenta que
 * quedó abierta o carga una reserva para el martes. */
export const CerradoHoyAviso = () => {
  const { locale, t } = useApp();
  const cutoffHour = useConfigStore((s) => s.cutoffHour);
  const diasCerrados = useConfigStore((s) => s.diasCerrados);

  if (!isClosedWeekday(weekdayInTz(), diasCerrados)) return null;

  const jornada = businessDayStart(
    cutoffHour,
    new Date(),
    TZ_NEGOCIO,
    diasCerrados,
  );
  const dia = jornada.toLocaleDateString(locale === "en" ? "en-US" : "es-AR", {
    weekday: "long",
    timeZone: TZ_NEGOCIO,
  });

  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-2xl border border-linea bg-crema/60 px-3.5 py-2.5 text-sm text-carbon/70"
    >
      <span className="rounded-full bg-carbon/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-carbon/60">
        {t("panel.cerrado")}
      </span>
      <span className="min-w-0">{t("panel.cerradoHoy", { dia })}</span>
    </p>
  );
};

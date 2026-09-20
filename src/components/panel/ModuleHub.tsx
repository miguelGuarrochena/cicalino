"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/Providers";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { useNavPending } from "@/lib/hooks/useNavPending";
import { NavIconSvg } from "@/components/panel/NavIcons";
import { CountBadge } from "@/components/ui/CountBadge";
import { MascotLoader } from "@/components/ui/MascotLoader";
import { JornadaInactivaState } from "@/components/panel/JornadaInactivaState";
import { useJornadaActiva } from "@/lib/hooks/useJornadaActiva";

/* Un color por módulo. Pagos compartía el azul de Pedidos y en el hub eran
 * dos círculos iguales: el color dejaba de decir de qué sección era. */
const TONE: Record<string, string> = {
  orders: "border-marca/30 bg-marca/10 text-marca",
  espera: "border-espera/30 bg-espera/10 text-espera",
  mesas: "border-pagos/30 bg-pagos/10 text-pagos",
};

export const ModuleHub = () => {
  const { t } = useApp();
  const { links, ready, visibles } = useOperationalAccess();
  const jornadaActiva = useJornadaActiva();
  const pendingFor = useNavPending();

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-2 py-6 sm:py-10">
      <h1 className="font-display text-center text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
        {t("hub.titulo")}
      </h1>
      <p className="mt-2 text-center text-sm text-carbon/55">{t("hub.sub")}</p>
      {!jornadaActiva && (
        <div className="mt-8 w-full">
          <JornadaInactivaState
            action={
              visibles.espera ? (
                <Link
                  href="/panel/espera"
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-espera px-5 text-sm font-semibold text-crema transition hover:bg-espera-fuerte"
                >
                  {t("panel.jornadaInactivaReserva")}
                </Link>
              ) : undefined
            }
          />
        </div>
      )}
      <nav
        aria-label={t("hub.titulo")}
        className={`mt-10 grid w-full gap-5 ${
          links.length === 1
            ? "grid-cols-1"
            : links.length === 2
              ? "grid-cols-2"
              : "grid-cols-3"
        }`}
      >
        {links.map((l) => {
          const { n, tone, label } = pendingFor(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-label={label(t(l.key))}
              className="flex min-h-[7.5rem] flex-col items-center justify-center gap-3 rounded-[28px] p-3 transition active:scale-[0.97] sm:min-h-[9rem]"
            >
              <span
                className={`relative flex size-[4.5rem] items-center justify-center rounded-full border-2 sm:size-24 ${TONE[l.icon]}`}
              >
                <NavIconSvg k={l.icon} size={32} />
                {/* Esta es la primera pantalla del turno: si Pedidos tiene
                    tres esperando, se tiene que ver antes de elegir.
                    `right-0 top-0` cae justo sobre el borde del círculo a 45°,
                    que en una caja cuadrada es la esquina; más afuera flota
                    suelto y no se lee como parte del botón. */}
                <CountBadge
                  n={jornadaActiva ? n : 0}
                  tone={tone}
                  pulse
                  className="absolute right-0 top-0"
                />
              </span>
              <span className="text-center text-sm font-semibold text-carbon">
                {t(l.key)}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

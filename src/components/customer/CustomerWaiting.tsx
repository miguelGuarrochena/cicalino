"use client";

import { useEffect, useRef, useState } from "react";
import { ThemedImg } from "@/components/ui/ThemedImg";
import { Controls } from "@/components/ui/Controls";
import { useApp } from "@/components/providers/Providers";
import { useCustomerOrder } from "@/lib/hooks/useCustomerOrder";
import {
  mostrarAvisoListo,
  pedirPermisoNotificaciones,
  registrarServiceWorker,
  suscribirWebPush,
} from "@/lib/notifications";
import { lanzarConfetiListo } from "@/lib/confetti";

interface Props {
  token: string;
}

/** Confeti + vibración + flash de fondo (también en re-avisos). */
const senalListo = (opts?: {
  referencia?: string;
  token?: string;
  body?: string;
  push?: boolean;
}) => {
  if ("vibrate" in navigator) {
    navigator.vibrate?.([200, 80, 200, 80, 400]);
  }
  void lanzarConfetiListo();
  if (opts?.push && opts.referencia && opts.token && opts.body) {
    void mostrarAvisoListo({
      referencia: opts.referencia,
      url: `/p/${opts.token}`,
      body: opts.body,
    });
  }
};

// Pantalla del cliente tras escanear el QR. Con Supabase hace polling al
// endpoint público (/api/p/[token]); en demo lee del store local.
export const CustomerWaiting = ({ token }: Props) => {
  const { t, locale } = useApp();
  const { ready: hydrated, order } = useCustomerOrder(token);
  const [pushActivo, setPushActivo] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [flash, setFlash] = useState(false);
  const ultimoAviso = useRef<string | null>(null);
  const vioEsperando = useRef(false);

  const marcarRetirado = async () => {
    setConfirmado(true);
    try {
      await fetch(`/api/p/${token}/retirado`, { method: "POST" });
    } catch {
      /* el polling lo reflejará igual */
    }
  };

  useEffect(() => {
    void registrarServiceWorker();
    if ("Notification" in window && Notification.permission === "granted") {
      setPushActivo(true);
    }
  }, []);

  const status = order?.status ?? "creado";
  const esListo = status === "listo";
  const esRetirado = status === "retirado" || confirmado;
  const esCancelado = status === "cancelado";
  const esOk = esListo || esRetirado;
  const cerrado = esOk || esCancelado;
  const waiting = hydrated && !!order && !cerrado;

  useEffect(() => {
    if (!order) return;
    if (order.status === "creado" || order.status === "en_preparacion") {
      vioEsperando.current = true;
    }
  }, [order]);

  useEffect(() => {
    if (!waiting) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [waiting]);

  // Señal al pasar a listo y cada "Volver a avisar" (cambia avisado_en).
  useEffect(() => {
    if (!order || order.status !== "listo") return;
    const clave = order.avisadoEn ?? "listo";

    if (ultimoAviso.current === null) {
      ultimoAviso.current = clave;
      // QR abierto ya en listo: no disparamos. Si venimos de esperar, sí.
      if (!vioEsperando.current) return;
    } else if (ultimoAviso.current === clave) {
      return;
    } else {
      ultimoAviso.current = clave;
    }

    setFlash(true);
    window.setTimeout(() => setFlash(false), 900);
    senalListo({
      push: pushActivo,
      referencia: order.referencia,
      token,
      body: t("cliente.notifListo", { n: order.referencia }),
    });
  }, [order, pushActivo, t, token]);

  const activarAvisos = async () => {
    await registrarServiceWorker();
    const ok = await pedirPermisoNotificaciones();
    setPushActivo(ok);
    if (ok) void suscribirWebPush(token);
  };

  if (!hydrated) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-sm text-carbon/45">…</p>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-14 text-center">
        <Controls className="absolute right-4 top-4" />
        <ThemedImg name="bell" alt="" className="h-28 opacity-50" />
        <p className="mt-6 font-display text-2xl uppercase text-carbon">
          {t("cliente.noEncontradoTitulo")}
        </p>
        <p className="mt-2 max-w-sm text-carbon/60">
          {t("cliente.noEncontradoSub")}
        </p>
      </main>
    );
  }

  return (
    <main
      className={`relative flex min-h-dvh flex-col items-center px-6 pb-14 pt-16 text-center transition-colors duration-500 ${
        flash ? "bg-emerald-200/70 dark:bg-emerald-500/25" : "bg-crema"
      }`}
    >
      <Controls className="absolute right-4 top-4 z-20" />

      {waiting && (
        <p className="u-in mb-6 w-full max-w-sm rounded-2xl border border-amber-300/50 bg-amber-50 px-3 py-2.5 text-xs font-medium leading-snug text-amber-900/80 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100/90">
          {pushActivo ? t("cliente.noCerrarPush") : t("cliente.noCerrar")}
        </p>
      )}

      <div className="u-in flex flex-1 flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-1">
          {order.nombreLocal && (
            <span className="mb-1 max-w-[16rem] truncate font-display text-lg uppercase tracking-tight text-carbon/70 sm:max-w-xs sm:text-xl">
              {order.nombreLocal}
            </span>
          )}
          <span className="text-xs uppercase tracking-widest text-carbon/40">
            {t(`modo.${order.modo}`)}
          </span>
          <span className="font-display text-6xl leading-none text-marca">
            {order.referencia}
          </span>
        </div>

        <div className="relative my-8 flex size-60 max-w-full items-center justify-center sm:size-64">
          <span
            className={`pointer-events-none absolute inset-0 m-auto size-52 rounded-full transition-colors duration-500 sm:size-56 ${
              esCancelado
                ? "bg-red-400/10"
                : esOk
                  ? "bg-emerald-400/15"
                  : "bg-amber-400/15"
            }`}
          />
          {!cerrado && (
            <span className="pointer-events-none absolute inset-0 m-auto size-52 animate-ping rounded-full bg-amber-400/10 sm:size-56" />
          )}
          <div
            key={esCancelado ? "cancel" : esRetirado ? "done" : esListo ? "ok" : "chef"}
            className={`relative z-10 flex size-full items-center justify-center ${
              cerrado ? "u-pop" : "u-float"
            }`}
          >
            <ThemedImg
              name={esOk ? "ok" : "chef"}
              alt=""
              className={`max-h-44 w-auto sm:max-h-48 ${esCancelado ? "opacity-40 grayscale" : ""}`}
            />
          </div>
        </div>

        <div className="u-in min-h-[92px]">
          {esCancelado ? (
            <>
              <p className="font-display text-3xl uppercase tracking-tight text-red-600/80">
                {t("cliente.canceladoTitulo")}
              </p>
              <p className="mt-2 text-carbon/60">{t("cliente.canceladoSub")}</p>
            </>
          ) : esRetirado ? (
            <>
              <p className="font-display text-3xl uppercase tracking-tight text-emerald-700">
                {t("cliente.retiradoTitulo")}
              </p>
              <p className="mt-2 max-w-sm text-carbon/60">
                {t("cliente.retiradoSub")}
              </p>
            </>
          ) : esListo ? (
            <>
              <p className="font-display text-3xl uppercase tracking-tight text-emerald-600">
                {t("cliente.listoTitulo")}
              </p>
              <p className="mt-2 text-carbon/60">{t("cliente.listoSub")}</p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl uppercase tracking-tight text-carbon sm:text-3xl">
                {t("cliente.preparandoTitulo")}
              </p>
              <p className="mt-2 max-w-sm text-carbon/60">
                {t("cliente.preparandoSub")}
              </p>
            </>
          )}
        </div>

        {esListo && !esRetirado && (
          <div className="u-in mt-6 w-full max-w-sm">
            <button
              type="button"
              onClick={marcarRetirado}
              className="w-full rounded-full border border-emerald-300 bg-emerald-50 px-6 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 active:scale-95 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              {locale === "en" ? "I picked it up 👍" : "Ya lo retiré 👍"}
            </button>
          </div>
        )}

        {!cerrado && (
          <button
            type="button"
            onClick={activarAvisos}
            disabled={pushActivo}
            className="u-in mt-8 w-full max-w-sm rounded-full bg-marca px-6 py-4 font-semibold text-crema shadow-sm transition hover:bg-marca-fuerte active:scale-95 disabled:opacity-70"
          >
            {pushActivo ? `${t("cliente.activados")} 🔔` : t("cliente.activar")}
          </button>
        )}
      </div>

      <p className="mt-8 text-xs text-carbon/35">
        {t("cliente.espera")} · cicalino.net
      </p>
    </main>
  );
};

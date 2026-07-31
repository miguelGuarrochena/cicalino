"use client";

import { useEffect, useRef, useState } from "react";
import { ThemedImg } from "@/components/ui/ThemedImg";
import { MascotLoader } from "@/components/ui/MascotLoader";
import { Controls } from "@/components/ui/Controls";
import { ModalShell } from "@/components/ui/ModalShell";
import { useApp } from "@/components/providers/Providers";
import { useCustomerEspera } from "@/lib/hooks/useCustomerEspera";
import { useEsperaStore } from "@/lib/store/espera-store";
import { supabaseConfigurado } from "@/lib/supabase/config";
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

const senalMesa = (opts?: {
  notifLocal?: boolean;
  nombre?: string;
  token?: string;
  body?: string;
}) => {
  if ("vibrate" in navigator) {
    navigator.vibrate?.([200, 100, 200, 100, 200]);
  }
  void lanzarConfetiListo();
  if (
    opts?.notifLocal &&
    opts.nombre &&
    opts.token &&
    opts.body &&
    typeof document !== "undefined" &&
    document.visibilityState === "hidden"
  ) {
    void mostrarAvisoListo({
      referencia: opts.nombre,
      url: `/e/${opts.token}`,
      body: opts.body,
    });
  }
};

export const CustomerEsperaWaiting = ({ token }: Props) => {
  const { t, locale } = useApp();
  const { ready, found, espera } = useCustomerEspera(token);
  const demoCancelar = useEsperaStore((s) => s.cambiarEstado);
  const [pushActivo, setPushActivo] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushCargando, setPushCargando] = useState(false);
  const [flash, setFlash] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const ultimoAviso = useRef<string | null>(null);
  const vioEsperando = useRef(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await registrarServiceWorker();
      if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
      }
      const r = await suscribirWebPush(token);
      if (!alive) return;
      setPushActivo(r.ok);
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (!espera) return;
    if (espera.status === "esperando") vioEsperando.current = true;
  }, [espera]);

  const avisado =
    espera?.status === "avisado" || espera?.status === "sentado";
  const sentado = espera?.status === "sentado";
  const cancelado = espera?.status === "cancelado";
  const cerrado = sentado || cancelado;
  const waiting = ready && found && !!espera && !cerrado && !avisado;
  const puedeCancelar =
    !!espera &&
    (espera.status === "esperando" || espera.status === "avisado");

  useEffect(() => {
    if (!waiting) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [waiting]);

  useEffect(() => {
    if (!espera) return;
    if (espera.status !== "avisado" && espera.status !== "sentado") return;
    const key = espera.avisadoEn ?? espera.status;

    if (ultimoAviso.current === null) {
      ultimoAviso.current = key;
      if (!vioEsperando.current) return;
    } else if (ultimoAviso.current === key) {
      return;
    } else {
      ultimoAviso.current = key;
    }

    setFlash(true);
    window.setTimeout(() => setFlash(false), 900);
    senalMesa({
      notifLocal: !pushActivo,
      nombre: espera.nombre,
      token,
      body: t("clienteMesa.notifListo", { n: espera.nombre }),
    });
  }, [espera, pushActivo, token, t]);

  const activarAvisos = async () => {
    setPushCargando(true);
    setPushError(null);
    await registrarServiceWorker();
    const permiso = await pedirPermisoNotificaciones();
    if (!permiso) {
      setPushActivo(false);
      setPushError(t("clienteMesa.pushDenegado"));
      setPushCargando(false);
      return;
    }
    const r = await suscribirWebPush(token);
    setPushActivo(r.ok);
    setPushError(r.ok ? null : t("clienteMesa.pushError"));
    setPushCargando(false);
  };

  const confirmarCancelar = async () => {
    if (cancelando) return;
    setCancelando(true);
    try {
      if (!supabaseConfigurado) {
        const demo = useEsperaStore
          .getState()
          .esperas.find((e) => e.qrToken === token);
        if (demo) demoCancelar(demo.id, "cancelado");
      } else {
        await fetch(`/api/e/${token}/cancelar`, { method: "POST" });
      }
      setConfirmCancel(false);
    } finally {
      setCancelando(false);
    }
  };

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <MascotLoader />
      </main>
    );
  }

  if (!found || !espera) {
    return (
      <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-14 text-center">
        <Controls className="absolute right-4 top-4" />
        <ThemedImg name="bell" alt="" className="h-28 opacity-50" />
        <p className="mt-6 font-display text-2xl uppercase text-carbon">
          {t("clienteMesa.noEncontradoTitulo")}
        </p>
        <p className="mt-2 max-w-sm text-carbon/60">
          {t("clienteMesa.noEncontradoSub")}
        </p>
      </main>
    );
  }

  const esOk = avisado || sentado;

  return (
    <main
      className={`relative flex min-h-dvh flex-col items-center px-6 pb-14 pt-16 text-center transition-colors duration-500 ${
        flash ? "bg-espera/25" : "bg-crema"
      }`}
    >
      <Controls className="absolute right-4 top-4 z-20" />

      {waiting && (
        <p className="u-in mb-6 w-full rounded-2xl border border-espera/40 bg-espera/10 px-3 py-2.5 text-xs font-medium leading-snug text-espera sm:max-w-sm">
          {pushActivo
            ? t("clienteMesa.noCerrarPush")
            : t("clienteMesa.noCerrar")}
        </p>
      )}

      <div className="u-in flex flex-1 flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-1">
          {espera.nombreLocal && (
            <span className="mb-1 max-w-[16rem] truncate font-display text-lg uppercase tracking-tight text-carbon/70 sm:max-w-xs sm:text-xl">
              {espera.nombreLocal}
            </span>
          )}
          <span className="text-xs uppercase tracking-widest text-espera/70">
            {t("clienteMesa.titulo")}
          </span>
          <span className="font-display text-5xl leading-none text-espera sm:text-6xl">
            {espera.nombre}
          </span>
          <span className="mt-1 text-sm text-carbon/50">
            {espera.personas}{" "}
            {espera.personas === 1
              ? locale === "en"
                ? "guest"
                : "persona"
              : locale === "en"
                ? "guests"
                : "personas"}
          </span>
        </div>

        <div className="relative my-8 flex size-60 max-w-full items-center justify-center sm:size-64">
          <span
            className={`pointer-events-none absolute inset-0 m-auto size-52 rounded-full transition-colors duration-500 sm:size-56 ${
              cancelado
                ? "bg-red-400/10"
                : esOk
                  ? "bg-espera/20"
                  : "bg-espera/10"
            }`}
          />
          {!cerrado && !avisado && (
            <span className="pointer-events-none absolute inset-0 m-auto size-52 animate-ping rounded-full bg-espera/15 sm:size-56" />
          )}
          <div
            key={
              cancelado
                ? "cancel"
                : sentado
                  ? "sentado"
                  : avisado
                    ? "ok"
                    : "bell"
            }
            className={`relative z-10 flex size-full items-center justify-center ${
              cerrado || avisado ? "u-pop" : "u-float"
            }`}
          >
            <ThemedImg
              name={esOk ? "ok" : "bell"}
              alt=""
              className={`max-h-44 w-auto sm:max-h-48 ${cancelado ? "opacity-40 grayscale" : ""}`}
            />
          </div>
        </div>

        <div className="u-in min-h-[92px]">
          {cancelado ? (
            <>
              <p className="font-display text-3xl uppercase tracking-tight text-red-600/80">
                {t("clienteMesa.canceladoTitulo")}
              </p>
              <p className="mt-2 text-carbon/60">
                {t("clienteMesa.canceladoSub")}
              </p>
            </>
          ) : sentado ? (
            <>
              <p className="font-display text-3xl uppercase tracking-tight text-espera">
                {t("clienteMesa.sentadoTitulo", {
                  n: String(espera.mesaNumero ?? ""),
                })}
              </p>
              <p className="mt-2 max-w-sm text-carbon/60">
                {t("clienteMesa.sentadoSub")}
              </p>
            </>
          ) : avisado ? (
            <>
              <p className="font-display text-3xl uppercase tracking-tight text-espera">
                {t("clienteMesa.listoTitulo")}
              </p>
              <p className="mt-2 text-carbon/60">{t("clienteMesa.listoSub")}</p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl uppercase tracking-tight text-carbon sm:text-3xl">
                {t("clienteMesa.esperandoTitulo")}
              </p>
              <p className="mt-2 max-w-sm text-carbon/60">
                {t("clienteMesa.esperandoSub")}
              </p>
            </>
          )}
        </div>

        {waiting && espera.cola && (
          <div className="u-in mt-6 w-full rounded-2xl border border-espera/25 bg-espera/10 px-4 py-3 text-sm text-espera sm:max-w-sm">
            <p className="font-semibold">
              {espera.cola.gruposDelante === 0
                ? t("clienteMesa.colaPrimero")
                : t("clienteMesa.colaDelante", {
                    g: String(espera.cola.gruposDelante),
                    gLabel:
                      espera.cola.gruposDelante === 1
                        ? t("clienteMesa.colaGrupo")
                        : t("clienteMesa.colaGrupos"),
                    p: String(espera.cola.personasDelante),
                    pLabel:
                      espera.cola.personasDelante === 1
                        ? t("clienteMesa.colaPersona")
                        : t("clienteMesa.colaPersonas"),
                  })}
            </p>
            <p className="mt-1 text-xs opacity-80">
              {t("clienteMesa.colaTotal", {
                g: String(espera.cola.gruposEnCola),
                gLabel:
                  espera.cola.gruposEnCola === 1
                    ? t("clienteMesa.colaGrupo")
                    : t("clienteMesa.colaGrupos"),
                p: String(espera.cola.personasEnCola),
                pLabel:
                  espera.cola.personasEnCola === 1
                    ? t("clienteMesa.colaPersona")
                    : t("clienteMesa.colaPersonas"),
              })}
            </p>
          </div>
        )}

        {!cerrado && (
          <div className="u-in mt-8 flex w-full flex-col gap-3 sm:max-w-sm">
            <button
              type="button"
              onClick={() => void activarAvisos()}
              disabled={pushActivo || pushCargando}
              className="w-full rounded-full bg-espera px-6 py-4 font-semibold text-crema shadow-sm transition hover:bg-espera-fuerte active:scale-95 disabled:opacity-70"
            >
              {pushCargando
                ? t("clienteMesa.pushCargando")
                : pushActivo
                  ? `${t("clienteMesa.activados")} 🔔`
                  : t("clienteMesa.activar")}
            </button>
            {pushError && (
              <p className="text-center text-xs text-red-500">{pushError}</p>
            )}
            {puedeCancelar && (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="w-full rounded-full px-6 py-3 text-sm font-semibold text-red-600/80 transition hover:bg-red-50 active:scale-95"
              >
                {t("clienteMesa.cancelarBtn")}
              </button>
            )}
          </div>
        )}
      </div>

      <p className="mt-8 text-xs text-carbon/35">
        {t("clienteMesa.espera")} · cicalino.net
      </p>

      {confirmCancel && (
        <ModalShell
          onClose={() => {
            if (!cancelando) setConfirmCancel(false);
          }}
          labelledBy="cancel-mesa-title"
          busy={cancelando}
        >
          <h2
            id="cancel-mesa-title"
            className="font-display text-xl uppercase tracking-tight text-carbon"
          >
            {t("clienteMesa.confirmarCancelTitulo")}
          </h2>
          <p className="mt-2 text-sm text-carbon/60">
            {t("clienteMesa.confirmarCancelSub")}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              disabled={cancelando}
              onClick={() => void confirmarCancelar()}
              className="w-full rounded-full bg-red-500 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
            >
              {cancelando ? "…" : t("clienteMesa.confirmarCancelSi")}
            </button>
            <button
              type="button"
              disabled={cancelando}
              onClick={() => setConfirmCancel(false)}
              className="w-full rounded-full border border-linea px-5 py-3.5 text-sm font-semibold text-carbon transition hover:bg-crema disabled:opacity-60"
            >
              {t("clienteMesa.confirmarCancelNo")}
            </button>
          </div>
        </ModalShell>
      )}
    </main>
  );
};

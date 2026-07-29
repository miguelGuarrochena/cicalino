"use client";

import { useEffect, useRef, useState } from "react";
import { ThemedImg } from "@/components/ui/ThemedImg";
import { Controls } from "@/components/ui/Controls";
import { useApp } from "@/components/providers/Providers";
import { useCustomerEspera } from "@/lib/hooks/useCustomerEspera";
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

const senalMesa = (opts?: { notifLocal?: boolean; nombre?: string; token?: string; body?: string }) => {
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
  const { locale } = useApp();
  const { ready, found, espera } = useCustomerEspera(token);
  const [pushActivo, setPushActivo] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushCargando, setPushCargando] = useState(false);
  const [flash, setFlash] = useState(false);
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
    window.setTimeout(() => setFlash(false), 2500);
    senalMesa({
      notifLocal: !pushActivo,
      nombre: espera.nombre,
      token,
      body:
        locale === "en" ? "Your table is ready!" : "¡Tu mesa está lista!",
    });
  }, [espera, pushActivo, token, locale]);

  const activarPush = async () => {
    setPushCargando(true);
    setPushError(null);
    await registrarServiceWorker();
    const permiso = await pedirPermisoNotificaciones();
    if (!permiso) {
      setPushActivo(false);
      setPushError(
        locale === "en" ? "Notifications blocked" : "Notificaciones bloqueadas",
      );
      setPushCargando(false);
      return;
    }
    const r = await suscribirWebPush(token);
    setPushActivo(r.ok);
    setPushError(
      r.ok
        ? null
        : locale === "en"
          ? "Couldn’t enable push"
          : "No se pudo activar el aviso",
    );
    setPushCargando(false);
  };

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-crema">
        <div className="size-10 animate-pulse rounded-full bg-espera/30" />
      </div>
    );
  }

  if (!found || !espera) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-crema px-6 text-center">
        <ThemedImg name="bell" className="h-16 w-16 opacity-40" />
        <p className="font-display text-xl uppercase text-carbon">
          {locale === "en" ? "Link expired" : "Link vencido"}
        </p>
        <p className="max-w-xs text-sm text-carbon/55">
          {locale === "en"
            ? "Ask the host for a new QR."
            : "Pedí un QR nuevo en la recepción."}
        </p>
      </div>
    );
  }

  const avisado =
    espera.status === "avisado" || espera.status === "sentado";
  const sentado = espera.status === "sentado";
  const cancelado = espera.status === "cancelado";

  return (
    <div
      className={`relative flex min-h-dvh flex-col bg-crema transition ${
        flash ? "bg-espera/15" : ""
      }`}
    >
      <header className="flex items-center justify-between px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-espera">
          {espera.nombreLocal || "Cicalino"}
        </p>
        <Controls />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-espera/70">
          {locale === "en" ? "Table wait" : "Espera de mesa"}
        </p>
        <h1 className="mt-2 font-display text-4xl uppercase tracking-tight text-carbon">
          {espera.nombre}
        </h1>
        <p className="mt-1 text-sm text-carbon/55">
          {espera.personas} {locale === "en" ? "guests" : "personas"}
        </p>

        <div
          className={`mt-10 w-full rounded-[28px] border px-6 py-10 shadow-sm ${
            cancelado
              ? "border-linea bg-surface text-carbon/50"
              : sentado
                ? "border-espera/30 bg-espera text-crema"
                : avisado
                  ? "border-espera/40 bg-espera/15 text-espera"
                  : "border-linea bg-surface text-carbon"
          }`}
        >
          <p className="font-display text-2xl uppercase tracking-tight sm:text-3xl">
            {cancelado
              ? locale === "en"
                ? "Cancelled"
                : "Cancelado"
              : sentado
                ? locale === "en"
                  ? `Table ${espera.mesaNumero ?? ""}`
                  : `Mesa ${espera.mesaNumero ?? ""}`
                : avisado
                  ? locale === "en"
                    ? "Your table is ready!"
                    : "¡Tu mesa está lista!"
                  : locale === "en"
                    ? "Waiting for a table…"
                    : "Esperando mesa…"}
          </p>
          <p className="mt-3 text-sm opacity-80">
            {cancelado
              ? locale === "en"
                ? "Ask the host if you need help."
                : "Consultá en recepción si necesitás ayuda."
              : sentado
                ? locale === "en"
                  ? "Enjoy your meal."
                  : "Buen provecho."
                : avisado
                  ? locale === "en"
                    ? "Please come to the host stand."
                    : "Acercate a la recepción."
                  : locale === "en"
                    ? "Keep this screen open. We’ll notify you."
                    : "Dejá esta pantalla abierta. Te avisamos."}
          </p>
        </div>

        {!avisado && !cancelado && !pushActivo && (
          <button
            type="button"
            disabled={pushCargando}
            onClick={() => void activarPush()}
            className="mt-8 rounded-full border border-espera/40 bg-espera/10 px-5 py-2.5 text-sm font-semibold text-espera transition hover:bg-espera hover:text-crema disabled:opacity-60"
          >
            {pushCargando
              ? "…"
              : locale === "en"
                ? "Enable notifications"
                : "Activar notificaciones"}
          </button>
        )}
        {pushError && (
          <p className="mt-3 text-xs text-red-600/80">{pushError}</p>
        )}
        {pushActivo && !avisado && !cancelado && (
          <p className="mt-4 text-xs font-medium text-espera/80">
            {locale === "en"
              ? "Notifications on — you can leave this tab."
              : "Avisos activos — podés salir de esta pestaña."}
          </p>
        )}
      </main>
    </div>
  );
};

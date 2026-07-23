"use client";

import { useEffect, useRef, useState } from "react";
import { ThemedImg } from "@/components/ui/ThemedImg";
import { Controls } from "@/components/ui/Controls";
import { useApp } from "@/components/providers/Providers";
import { useConfigStore } from "@/lib/store/config-store";
import {
  pedidoPorToken,
  usePedidosStore,
} from "@/lib/store/pedidos-store";
import {
  mostrarAvisoListo,
  pedirPermisoNotificaciones,
  registrarServiceWorker,
} from "@/lib/notificaciones";

interface Props {
  token: string;
}

// Pantalla del cliente tras escanear el QR.
// Lee el pedido por token del store (mismo browser que el panel en el demo).
// En producción: polling / Web Push contra /api/p/[token].
export const EsperaCliente = ({ token }: Props) => {
  const { t } = useApp();
  const cfg = useConfigStore();
  const seedSiVacio = usePedidosStore((s) => s.seedSiVacio);
  const pedidos = usePedidosStore((s) => s.pedidos);
  const [pushActivo, setPushActivo] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const prevEstado = useRef<string | null>(null);

  useEffect(() => {
    const done = () => {
      seedSiVacio();
      setHydrated(true);
    };
    const result = usePedidosStore.persist.rehydrate();
    if (result && typeof (result as Promise<void>).then === "function") {
      void (result as Promise<void>).then(done);
    } else {
      done();
    }
  }, [seedSiVacio]);

  // Registrar SW temprano (habilita avisos con pestaña en segundo plano)
  useEffect(() => {
    void registrarServiceWorker();
    if ("Notification" in window && Notification.permission === "granted") {
      setPushActivo(true);
    }
  }, []);

  // Sync entre pestañas (panel marca listo → cliente se actualiza)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "cicalino-pedidos") {
        void usePedidosStore.persist.rehydrate();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const pedido = pedidoPorToken(pedidos, token);
  const estado = pedido?.estado ?? "creado";
  const listo = estado === "listo" || estado === "retirado";
  const cancelado = estado === "cancelado";
  const cerrado = listo || cancelado;
  const esperando = hydrated && !!pedido && !cerrado;

  // Aviso al intentar cerrar/recargar mientras espera
  useEffect(() => {
    if (!esperando) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [esperando]);

  // Vibrar + notificación al pasar a listo
  useEffect(() => {
    if (!pedido) return;
    const prev = prevEstado.current;
    prevEstado.current = pedido.estado;
    if (prev == null || prev === pedido.estado) return;
    if (pedido.estado !== "listo") return;
    if ("vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
    if (pushActivo) {
      void mostrarAvisoListo({
        referencia: pedido.referencia,
        url: `/p/${token}`,
        body: t("cliente.notifListo", { n: pedido.referencia }),
      });
    }
  }, [pedido, pushActivo, t, token]);

  const activarAvisos = async () => {
    await registrarServiceWorker();
    const ok = await pedirPermisoNotificaciones();
    setPushActivo(ok);
  };

  if (!hydrated) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-sm text-carbon/45">…</p>
      </main>
    );
  }

  if (!pedido) {
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
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-14 text-center">
      <Controls className="absolute right-4 top-4" />

      {esperando && (
        <p className="u-in absolute inset-x-4 top-14 mx-auto max-w-sm rounded-2xl border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900/80 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100/90">
          {pushActivo ? t("cliente.noCerrarPush") : t("cliente.noCerrar")}
        </p>
      )}

      <div className="u-in flex flex-col items-center gap-1">
        <span className="text-sm font-semibold text-carbon/50">
          {cfg.nombre}
        </span>
        <span className="text-xs uppercase tracking-widest text-carbon/40">
          {t(`modo.${cfg.modo}`)}
        </span>
        <span className="font-display text-6xl leading-none text-marca">
          {pedido.referencia}
        </span>
      </div>

      <div className="relative my-8 flex size-60 max-w-full items-center justify-center sm:size-64">
        <span
          className={`pointer-events-none absolute inset-0 m-auto size-52 rounded-full transition-colors duration-500 sm:size-56 ${
            cancelado
              ? "bg-red-400/10"
              : listo
                ? "bg-emerald-400/15"
                : "bg-amber-400/15"
          }`}
        />
        {!cerrado && (
          <span className="pointer-events-none absolute inset-0 m-auto size-52 animate-ping rounded-full bg-amber-400/10 sm:size-56" />
        )}
        <div
          key={cancelado ? "cancel" : listo ? "ok" : "chef"}
          className={`relative z-10 flex size-full items-center justify-center ${
            cerrado ? "u-pop" : "u-float"
          }`}
        >
          <ThemedImg
            name={listo ? "ok" : "chef"}
            alt=""
            className={`max-h-44 w-auto sm:max-h-48 ${cancelado ? "opacity-40 grayscale" : ""}`}
          />
        </div>
      </div>

      <div className="u-in min-h-[92px]">
        {cancelado ? (
          <>
            <p className="font-display text-3xl uppercase tracking-tight text-red-600/80">
              {t("cliente.canceladoTitulo")}
            </p>
            <p className="mt-2 text-carbon/60">{t("cliente.canceladoSub")}</p>
          </>
        ) : listo ? (
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

      <p className="mt-12 text-xs text-carbon/35">
        {t("cliente.espera")} · cicalino.ar
      </p>
    </main>
  );
};

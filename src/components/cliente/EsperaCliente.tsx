"use client";

import { useEffect, useRef, useState } from "react";
import { ThemedImg } from "@/components/ui/ThemedImg";
import { Controls } from "@/components/ui/Controls";
import { useApp } from "@/components/providers/Providers";
import { useConfigStore } from "@/lib/store/config-store";
import type { EstadoPedido } from "@/lib/types";

const POLL_MS = 4000;

interface Props {
  token: string;
}

// Pantalla que ve el cliente tras escanear el QR. Espera el aviso de "listo".
// Prototipo: simula el avance; en produccion hace polling a /api/p/[token]
// y ademas intenta suscribirse a Web Push.
export const EsperaCliente = ({ token }: Props) => {
  const { t } = useApp();
  const cfg = useConfigStore();
  const [estado, setEstado] = useState<EstadoPedido>("creado");
  const [pushActivo, setPushActivo] = useState(false);
  const inicio = useRef(Date.now());
  const listo = estado === "listo" || estado === "retirado";
  const cancelado = estado === "cancelado";
  const cerrado = listo || cancelado;

  useEffect(() => {
    if (cerrado) return;
    const id = setInterval(() => {
      if (Date.now() - inicio.current > 8000) {
        setEstado("listo");
        clearInterval(id);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [token, cerrado]);

  useEffect(() => {
    if (listo && pushActivo && "vibrate" in navigator) {
      navigator.vibrate?.([200, 100, 200]);
    }
  }, [listo, pushActivo]);

  const activarAvisos = async () => {
        if (!("Notification" in window)) {
          setPushActivo(true);
          return;
        }
        const permiso = await Notification.requestPermission();
        setPushActivo(permiso === "granted");
      };

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-14 text-center">
      <Controls className="absolute right-4 top-4" />

      <div className="u-in flex flex-col items-center gap-1">
        <span className="text-sm font-semibold text-carbon/50">
          {cfg.nombre}
        </span>
        <span className="text-xs uppercase tracking-widest text-carbon/40">
          {t(`modo.${cfg.modo}`)}
        </span>
        <span className="font-display text-6xl leading-none text-marca">42</span>
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

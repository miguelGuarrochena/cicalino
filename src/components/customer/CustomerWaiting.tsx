"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ThemedImg } from "@/components/ui/ThemedImg";
import { MascotLoader } from "@/components/ui/MascotLoader";
import { Controls } from "@/components/ui/Controls";
import { useApp } from "@/components/providers/Providers";
import {
  useCustomerOrder,
  type InitialCustomerOrder,
} from "@/lib/hooks/useCustomerOrder";
import {
  showReadyNotice,
  requestNotificationPermission,
  registerServiceWorker,
  subscribeWebPush,
  pushErrorMessageKey,
  canOfferWebPush,
} from "@/lib/notifications";
import { fireReadyConfetti } from "@/lib/confetti";

const subscribeNoop = () => () => {};

interface Props {
  token: string;
  /* Pedido ya resuelto en el servidor: evita el parpadeo del loader y el
   * primer fetch desde el navegador. */
  initial?: InitialCustomerOrder;
}

const senalListo = (opts?: {
  reference?: string;
  token?: string;
  body?: string;
  notifLocal?: boolean;
}) => {
  if ("vibrate" in navigator) {
    navigator.vibrate?.([200, 100, 200]);
  }
  void fireReadyConfetti();
  if (
    opts?.notifLocal &&
    opts.reference &&
    opts.token &&
    opts.body &&
    typeof document !== "undefined" &&
    document.visibilityState === "hidden"
  ) {
    void showReadyNotice({
      reference: opts.reference,
      url: `/p/${opts.token}`,
      body: opts.body,
    });
  }
};

export const CustomerWaiting = ({ token, initial }: Props) => {
  const { t } = useApp();
  const { ready: hydrated, order } = useCustomerOrder(token, initial);
  const pushDisponible = useSyncExternalStore(
    subscribeNoop,
    canOfferWebPush,
    () => false,
  );
  const [pushActivo, setPushActivo] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushCargando, setPushCargando] = useState(false);
  const [flash, setFlash] = useState(false);
  const ultimoAviso = useRef<string | null>(null);
  const vioEsperando = useRef(false);

  useEffect(() => {
    if (!pushDisponible) return;

    let alive = true;
    void (async () => {
      await registerServiceWorker();
      if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
      }
      const r = await subscribeWebPush(token);
      if (!alive) return;
      setPushActivo(r.ok);
      setPushError(
        r.ok ? null : t(`cliente.${pushErrorMessageKey(r.reason)}`),
      );
    })();
    return () => {
      alive = false;
    };
  }, [token, t, pushDisponible]);

  const status = order?.status ?? "creado";
  const esListo = status === "listo";
  const esRetirado = status === "retirado";
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

  useEffect(() => {
    if (!order || order.status !== "listo") return;
    const clave = order.notifiedAt ?? "listo";

    if (ultimoAviso.current === null) {
      ultimoAviso.current = clave;
      if (!vioEsperando.current) return;
    } else if (ultimoAviso.current === clave) {
      return;
    } else {
      ultimoAviso.current = clave;
    }

    setFlash(true);
    window.setTimeout(() => setFlash(false), 900);
    senalListo({
      notifLocal: !pushActivo,
      reference: order.reference,
      token,
      body: t("cliente.notifListo", { n: order.reference }),
    });
  }, [order, pushActivo, t, token]);

  const activarAvisos = async () => {
    if (!canOfferWebPush()) return;
    setPushCargando(true);
    setPushError(null);
    await registerServiceWorker();
    const permiso = await requestNotificationPermission();
    if (!permiso) {
      setPushActivo(false);
      setPushError(t("cliente.pushDenegado"));
      setPushCargando(false);
      return;
    }
    const r = await subscribeWebPush(token);
    setPushActivo(r.ok);
    setPushError(
      r.ok ? null : t(`cliente.${pushErrorMessageKey(r.reason)}`),
    );
    setPushCargando(false);
  };

  if (!hydrated) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <MascotLoader />
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
        flash ? "bg-emerald-200/70" : "bg-crema"
      }`}
    >
      <Controls className="absolute right-4 top-4 z-20" />

      {waiting && (
        <p className="u-in mb-6 w-full rounded-2xl border border-amber-300/80 bg-amber-100 px-3 py-2.5 text-xs font-medium leading-snug text-amber-950 sm:max-w-sm">
          {pushDisponible && pushActivo
            ? t("cliente.noCerrarPush")
            : t("cliente.noCerrar")}
        </p>
      )}

      <div className="u-in flex flex-1 flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-1">
          {order.branchName && (
            <span className="mb-1 max-w-[16rem] truncate font-display text-lg uppercase tracking-tight text-carbon/70 sm:max-w-xs sm:text-xl">
              {order.branchName}
            </span>
          )}
          <span className="text-xs uppercase tracking-widest text-carbon/40">
            {t(`modo.${order.modo}`)}
          </span>
          <span className="font-display text-6xl leading-none text-marca">
            {order.reference}
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

        {!cerrado && (
          <div className="u-in mt-8 w-full sm:max-w-sm">
            {pushDisponible ? (
              <>
                <button
                  type="button"
                  onClick={activarAvisos}
                  disabled={pushActivo || pushCargando}
                  className="w-full rounded-full bg-marca px-6 py-4 font-semibold text-crema shadow-sm transition hover:bg-marca-fuerte active:scale-95 disabled:opacity-70"
                >
                  {pushCargando
                    ? t("cliente.pushCargando")
                    : pushActivo
                      ? `${t("cliente.activados")} 🔔`
                      : t("cliente.activar")}
                </button>
                {pushError && (
                  <p className="mt-2 text-center text-xs text-red-500">
                    {pushError}
                  </p>
                )}
              </>
            ) : (
              <p className="rounded-2xl border border-carbon/10 bg-carbon/[0.04] px-4 py-3 text-sm leading-snug text-carbon/75">
                {t("cliente.mantenerPestana")}
              </p>
            )}
          </div>
        )}
      </div>

      <p className="mt-8 text-xs text-carbon/35">
        {t("cliente.espera")} · cicalino.net
      </p>
    </main>
  );
};

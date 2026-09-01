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
import { attachLeaveGuard } from "@/lib/hooks/customerPollWake";
import { useCustomerTabLock } from "@/lib/customerTabLock";
import {
  saveLastVisit,
  clearLastVisitIfToken,
} from "@/lib/customerLastVisit";
import { CustomerAliasForm } from "@/components/customer/CustomerAliasForm";
import { CustomerOtherTab } from "@/components/customer/CustomerOtherTab";
import {
  showReadyNotice,
  requestNotificationPermission,
  registerServiceWorker,
  subscribeWebPush,
  pushErrorMessageKey,
  canOfferWebPush,
  notificationPermissionGranted,
} from "@/lib/notifications";
import { fireReadyConfetti } from "@/lib/confetti";
import { alertCustomerReady, unlockAudio } from "@/lib/sound";

const subscribeNoop = () => () => {};

interface Props {
  token: string;
  /* Pedido ya resuelto en el servidor: evita el parpadeo del loader y el
   * primer fetch desde el navegador. */
  initial?: InitialCustomerOrder;
}

const senalPedido = (opts?: {
  reference?: string;
  token?: string;
  body?: string;
  notifLocal?: boolean;
  confetti?: boolean;
}) => {
  alertCustomerReady();
  if (opts?.confetti !== false) void fireReadyConfetti();
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
  const duplicate = useCustomerTabLock(`p:${token}`);
  const pushDisponible = useSyncExternalStore(
    subscribeNoop,
    canOfferWebPush,
    () => false,
  );
  const [pushActivo, setPushActivo] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushCargando, setPushCargando] = useState(false);
  const [flash, setFlash] = useState(false);
  const [aliasLocal, setAliasLocal] = useState<string | null | undefined>(
    undefined,
  );
  const ultimoAviso = useRef<string | null>(null);
  const vioEsperando = useRef(false);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (!pushDisponible) return;
    if (!notificationPermissionGranted()) return;

    let alive = true;
    void (async () => {
      await registerServiceWorker();
      const r = await subscribeWebPush(token);
      if (!alive) return;
      /* Silencioso: no mostrar error de re-bind automático (evita el falso
       * "demasiados intentos" al abrir la pestaña). */
      if (r.ok) {
        setPushActivo(true);
        setPushError(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, pushDisponible]);

  /* Reloj para el tiempo transcurrido. Mismo intervalo que la tarjeta del
   * mostrador: el minuto es la unidad que se muestra, así que 30 s alcanza. */
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  /* Desbloquear audio con el primer toque: sin gesto el navegador bloquea el beep. */
  useEffect(() => {
    const unlock = () => {
      void unlockAudio();
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);

  const status = order?.status ?? "creado";
  const esListo = status === "listo";
  const esRetirado = status === "retirado";
  const esCancelado = status === "cancelado";
  const esOk = esListo || esRetirado;
  const cerrado = esOk || esCancelado;
  const waiting = hydrated && !!order && !cerrado;
  const alias = aliasLocal !== undefined ? aliasLocal : (order?.alias ?? null);
  const puedeAlias = !!order && !esRetirado && !esCancelado && order.modo !== "nombre";
  /* Cuánto lleva esperando. Se muestra recién al minuto: en los primeros
   * segundos el cliente acaba de escanear y "0 min" no le dice nada. */
  const minutosEsperando =
    order?.createdAt && !cerrado
      ? Math.floor((ahora - new Date(order.createdAt).getTime()) / 60_000)
      : 0;

  useEffect(() => {
    if (!order || esRetirado || esCancelado) {
      if (hydrated) clearLastVisitIfToken(token);
      return;
    }
    saveLastVisit({
      kind: "p",
      token,
      label: order.reference,
      alias,
    });
  }, [order, esRetirado, esCancelado, token, alias, hydrated]);

  useEffect(() => {
    if (!order) return;
    if (order.status === "creado" || order.status === "en_preparacion") {
      vioEsperando.current = true;
    }
  }, [order]);

  useEffect(() => {
    if (!waiting || duplicate) return;
    return attachLeaveGuard();
  }, [waiting, duplicate]);

  useEffect(() => {
    if (duplicate) return;
    if (!order) return;
    if (order.status !== "listo" && order.status !== "retirado") return;
    /* Estado, no avisado_en: el panel escribe avisado_en al marcar listo y
     * /api/push/notify lo vuelve a pisar. Con notifiedAt un poll entre las
     * dos escrituras dispararía beep/confetti otra vez. */
    const clave = order.status;

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
    senalPedido({
      notifLocal: !pushActivo,
      reference: order.reference,
      token,
      confetti: order.status === "listo",
      body:
        order.status === "retirado"
          ? t("cliente.notifRetirado", { n: order.reference })
          : t("cliente.notifListo", { n: order.reference }),
    });
  }, [order, pushActivo, t, token, duplicate]);

  const activarAvisos = async () => {
    if (!canOfferWebPush() || pushCargando) return;
    setPushCargando(true);
    setPushError(null);
    try {
      await registerServiceWorker();
      void unlockAudio();
      const permiso = await requestNotificationPermission();
      if (!permiso) {
        setPushActivo(false);
        setPushError(t("cliente.pushDenegado"));
        return;
      }
      const r = await subscribeWebPush(token);
      setPushActivo(r.ok);
      setPushError(
        r.ok ? null : t(`cliente.${pushErrorMessageKey(r.reason)}`),
      );
    } finally {
      setPushCargando(false);
    }
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

  if (duplicate && waiting) {
    return (
      <CustomerOtherTab
        title={t("cliente.otraPestanaTitulo")}
        body={t("cliente.otraPestanaSub")}
      />
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
        <div className="u-in mb-6 w-full rounded-2xl border border-amber-300/80 bg-amber-100 px-3 py-2.5 text-amber-950 sm:max-w-sm">
          <p className="text-sm font-semibold">
            {t("cliente.noCerrarTitulo")}
          </p>
          <p className="mt-1 text-sm font-medium leading-snug">
            {alias
              ? t("cliente.siCerrasAlias", { n: order.reference, alias })
              : t("cliente.siCerras", { n: order.reference })}
          </p>
          <p className="mt-1.5 text-xs font-medium leading-snug text-amber-950/80">
            {pushDisponible && pushActivo
              ? t("cliente.noCerrarPush")
              : t("cliente.noCerrar")}
          </p>
        </div>
      )}

      <div className="u-in flex flex-1 flex-col items-center justify-center">
        <div className="flex w-full max-w-sm flex-col items-center gap-1">
          {order.branchName && (
            <span className="mb-1 max-w-[16rem] truncate font-display text-lg uppercase tracking-tight text-carbon/70 sm:max-w-xs sm:text-xl">
              {order.branchName}
            </span>
          )}
          <span className="text-xs uppercase tracking-widest text-carbon/40">
            {t(`modo.${order.modo}`)}
          </span>
          <span className="font-display text-7xl leading-none text-marca sm:text-8xl">
            {order.reference}
          </span>
          {puedeAlias && (
            <CustomerAliasForm
              token={token}
              alias={alias}
              onSaved={setAliasLocal}
            />
          )}
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
              {minutosEsperando >= 1 && (
                <p className="mt-2 text-sm font-medium tabular-nums text-carbon/45">
                  {t("cliente.transcurrido", { n: minutosEsperando })}
                </p>
              )}
            </>
          )}
        </div>

        {!cerrado && (
          <div className="u-in mt-8 w-full sm:max-w-sm">
            {pushDisponible ? (
              pushActivo ? (
                <p className="rounded-2xl border border-emerald-300/70 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                  {t("cliente.activados")}
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void activarAvisos()}
                    disabled={pushCargando}
                    className="w-full rounded-full bg-marca px-6 py-4 font-semibold text-crema shadow-sm transition hover:bg-marca-fuerte active:scale-95 disabled:opacity-70"
                  >
                    {pushCargando
                      ? t("cliente.pushCargando")
                      : t("cliente.activar")}
                  </button>
                  {pushError && (
                    <p className="mt-2 text-center text-xs text-red-500">
                      {pushError}
                    </p>
                  )}
                </>
              )
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

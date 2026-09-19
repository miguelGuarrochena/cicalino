"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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
import { CustomerBrandHeader } from "@/components/customer/CustomerBrandHeader";
import { CustomerBrandShell } from "@/components/customer/CustomerBrandShell";
import { CustomerNotice } from "@/components/customer/CustomerNotice";
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
import { useCustomerReadyAlert } from "@/lib/hooks/useCustomerReadyAlert";

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
  const [aliasLocal, setAliasLocal] = useState<string | null | undefined>(
    undefined,
  );

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
  const { flash, tick } = useCustomerReadyAlert({
    active:
      !duplicate &&
      !!order &&
      (order.status === "listo" || order.status === "retirado"),
    status: order?.status ?? null,
    notifiedAt: order?.notifiedAt ?? null,
    isWaiting:
      order?.status === "creado" || order?.status === "en_preparacion",
    onAlert: () => {
      if (!order) return;
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
    },
  });
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
    if (!waiting || duplicate) return;
    return attachLeaveGuard();
  }, [waiting, duplicate]);

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
        <Controls showTheme={false} className="absolute right-4 top-4" />
        <ThemedImg name="bell" alt="" className="h-28 opacity-50" />
        <p className="mt-6 font-display text-2xl uppercase text-carbon">
          {t("cliente.noEncontradoTitulo")}
        </p>
        <p className="mt-2 max-w-sm text-base leading-relaxed text-suave">
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
    <CustomerBrandShell color={order.colorMarca}>
    <main
      className={`relative flex min-h-dvh flex-col items-center px-6 pb-14 pt-16 text-center transition-colors duration-500 ${
        flash ? "u-alert-flash" : "bg-crema"
      }`}
    >
      <Controls showTheme={false} className="absolute right-4 top-4 z-20" />

      {waiting && (
        <CustomerNotice tone="curso" className="u-in mb-6 w-full text-left sm:max-w-sm">
          <p className="font-bold">{t("cliente.noCerrarTitulo")}</p>
          <p className="mt-1 font-medium leading-snug">
            {alias ? t("cliente.siCerrasAlias") : t("cliente.siCerras")}
          </p>
          <p className="mt-1.5 text-sm font-medium leading-snug text-suave">
            {pushDisponible && pushActivo
              ? t("cliente.noCerrarPush")
              : t("cliente.noCerrar")}
          </p>
        </CustomerNotice>
      )}

      <div className="u-in flex flex-1 flex-col items-center justify-center">
        <div className="flex w-full max-w-sm flex-col items-center gap-1">
          <CustomerBrandHeader
            name={order.branchName}
            logoUrl={order.logoUrl}
          />
          <span className="mt-1 text-sm font-semibold uppercase tracking-widest text-suave">
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
                ? "bg-alerta-fondo"
                : esOk
                  ? "bg-ok-fondo"
                  : "bg-curso-fondo"
            }`}
          />
          {!cerrado && (
            <span className="pointer-events-none absolute inset-0 m-auto size-52 animate-ping rounded-full bg-curso-fondo sm:size-56" />
          )}
          <div
            key={`${esCancelado ? "cancel" : esRetirado ? "done" : esListo ? "ok" : "chef"}-${tick}`}
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
              <p className="font-display text-3xl uppercase tracking-tight text-alerta">
                {t("cliente.canceladoTitulo")}
              </p>
              <p className="mt-2 text-base leading-relaxed text-suave">{t("cliente.canceladoSub")}</p>
            </>
          ) : esRetirado ? (
            <>
              <p className="font-display text-3xl uppercase tracking-tight text-ok">
                {t("cliente.retiradoTitulo")}
              </p>
              <p className="mt-2 max-w-sm text-base leading-relaxed text-suave">
                {t("cliente.retiradoSub")}
              </p>
            </>
          ) : esListo ? (
            <>
              <p className="font-display text-3xl uppercase tracking-tight text-ok">
                {t("cliente.listoTitulo")}
              </p>
              <p className="mt-2 text-base leading-relaxed text-suave">{t("cliente.listoSub")}</p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl uppercase tracking-tight text-carbon sm:text-3xl">
                {t("cliente.preparandoTitulo")}
              </p>
              <p className="mt-2 max-w-sm text-base leading-relaxed text-suave">
                {t("cliente.preparandoSub")}
              </p>
            </>
          )}
        </div>

        {!cerrado && (
          <div className="u-in mt-8 w-full sm:max-w-sm">
            {pushDisponible ? (
              pushActivo ? (
                <CustomerNotice tone="ok" className="text-left font-semibold">
                  {t("cliente.activados")}
                </CustomerNotice>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void activarAvisos()}
                    disabled={pushCargando}
                    className="min-h-14 w-full rounded-full bg-marca px-6 text-base font-semibold text-crema shadow-sm transition hover:bg-marca-fuerte active:scale-95 disabled:opacity-70"
                  >
                    {pushCargando
                      ? t("cliente.pushCargando")
                      : t("cliente.activar")}
                  </button>
                  {pushError && (
                    <CustomerNotice tone="alerta" role="alert" className="mt-3 text-left">
                      {pushError}
                    </CustomerNotice>
                  )}
                </>
              )
            ) : (
              <p className="rounded-2xl border border-linea bg-carbon/[0.04] px-4 py-3.5 text-base leading-snug text-carbon">
                {t("cliente.mantenerPestana")}
              </p>
            )}
          </div>
        )}
      </div>

      <p className="mt-8 text-sm text-suave">
        {t("cliente.espera")} · cicalino.net
      </p>
    </main>
    </CustomerBrandShell>
  );
};

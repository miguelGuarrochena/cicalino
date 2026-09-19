"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ThemedImg } from "@/components/ui/ThemedImg";
import { MascotLoader } from "@/components/ui/MascotLoader";
import { Controls } from "@/components/ui/Controls";
import { ModalShell } from "@/components/ui/ModalShell";
import { useApp } from "@/components/providers/Providers";
import { useCustomerWaitlist } from "@/lib/hooks/useCustomerWaitlist";
import { attachLeaveGuard } from "@/lib/hooks/customerPollWake";
import { useCustomerTabLock } from "@/lib/customerTabLock";
import {
  saveLastVisit,
  clearLastVisitIfToken,
} from "@/lib/customerLastVisit";
import { CustomerOtherTab } from "@/components/customer/CustomerOtherTab";
import { CustomerBrandHeader } from "@/components/customer/CustomerBrandHeader";
import { CustomerBrandShell } from "@/components/customer/CustomerBrandShell";
import { CustomerNotice } from "@/components/customer/CustomerNotice";
import { emptyCustomerBrand, type CustomerBrand } from "@/lib/customerBrand";
import { useWaitlistStore } from "@/lib/store/waitlist-store";
import { supabaseConfigured } from "@/lib/supabase/config";
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
  brand?: CustomerBrand;
}

const senalMesa = (opts?: {
  notifLocal?: boolean;
  name?: string;
  token?: string;
  body?: string;
}) => {
  alertCustomerReady();
  void fireReadyConfetti();
  if (
    opts?.notifLocal &&
    opts.name &&
    opts.token &&
    opts.body &&
    typeof document !== "undefined" &&
    document.visibilityState === "hidden"
  ) {
    void showReadyNotice({
      reference: opts.name,
      url: `/e/${opts.token}`,
      body: opts.body,
    });
  }
};

export const CustomerEsperaWaiting = ({
  token,
  brand = emptyCustomerBrand(),
}: Props) => {
  const { t, locale } = useApp();
  const { ready, found, espera } = useCustomerWaitlist(token, brand);
  const duplicate = useCustomerTabLock(`e:${token}`);
  const demoCancelar = useWaitlistStore((s) => s.cambiarEstado);
  const pushDisponible = useSyncExternalStore(
    subscribeNoop,
    canOfferWebPush,
    () => false,
  );
  const [pushActivo, setPushActivo] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushCargando, setPushCargando] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => {
    if (!pushDisponible) return;
    if (!notificationPermissionGranted()) return;

    let alive = true;
    void (async () => {
      await registerServiceWorker();
      const r = await subscribeWebPush(token);
      if (!alive) return;
      if (r.ok) {
        setPushActivo(true);
        setPushError(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, pushDisponible]);

  useEffect(() => {
    const unlock = () => {
      void unlockAudio();
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);

  const avisado =
    espera?.status === "avisado" || espera?.status === "sentado";
  const sentado = espera?.status === "sentado";
  const cancelado = espera?.status === "cancelado";
  const cerrado = sentado || cancelado;
  const waiting = ready && found && !!espera && !cerrado && !avisado;
  const puedeCancelar =
    !!espera &&
    (espera.status === "esperando" || espera.status === "avisado");
  const { flash, tick } = useCustomerReadyAlert({
    active:
      !duplicate &&
      !!espera &&
      (espera.status === "avisado" || espera.status === "sentado"),
    status: espera?.status ?? null,
    notifiedAt: espera?.notifiedAt ?? null,
    isWaiting: espera?.status === "esperando",
    onAlert: () => {
      if (!espera) return;
      senalMesa({
        notifLocal: !pushActivo,
        name: espera.name,
        token,
        body: t("clienteMesa.notifListo", { n: espera.name }),
      });
    },
  });

  useEffect(() => {
    if (!espera || cerrado) {
      if (ready) clearLastVisitIfToken(token);
      return;
    }
    saveLastVisit({
      kind: "e",
      token,
      label: espera.name,
    });
  }, [espera, cerrado, token, ready]);

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
        setPushError(t("clienteMesa.pushDenegado"));
        return;
      }
      const r = await subscribeWebPush(token);
      setPushActivo(r.ok);
      setPushError(
        r.ok ? null : t(`clienteMesa.${pushErrorMessageKey(r.reason)}`),
      );
    } finally {
      setPushCargando(false);
    }
  };

  const confirmarCancelar = async () => {
    if (cancelando) return;
    setCancelando(true);
    try {
      if (!supabaseConfigured) {
        const demo = useWaitlistStore
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
        <Controls showTheme={false} className="absolute right-4 top-4" />
        <ThemedImg name="bell" alt="" className="h-28 opacity-50" />
        <p className="mt-6 font-display text-2xl uppercase text-carbon">
          {t("clienteMesa.noEncontradoTitulo")}
        </p>
        <p className="mt-2 max-w-sm text-base leading-relaxed text-suave">
          {t("clienteMesa.noEncontradoSub")}
        </p>
      </main>
    );
  }

  if (duplicate && waiting) {
    return (
      <CustomerOtherTab
        title={t("clienteMesa.otraPestanaTitulo")}
        body={t("clienteMesa.otraPestanaSub")}
      />
    );
  }

  const esOk = avisado || sentado;

  return (
    <CustomerBrandShell color={espera.colorMarca ?? brand.color}>
    <main
      className={`relative flex min-h-dvh flex-col items-center px-6 pb-14 pt-16 text-center transition-colors duration-500 ${
        flash ? "u-alert-flash-espera" : "bg-crema"
      }`}
    >
      <Controls showTheme={false} className="absolute right-4 top-4 z-20" />

      {waiting && (
        <CustomerNotice tone="curso" className="u-in mb-6 w-full text-left sm:max-w-sm">
          <p className="font-bold">
            {t("clienteMesa.noCerrarTitulo")}
          </p>
          <p className="mt-1 font-medium leading-snug">
            {t("clienteMesa.siCerras", { n: espera.name })}
          </p>
          <p className="mt-1.5 text-sm font-medium leading-snug text-suave">
            {pushDisponible && pushActivo
              ? t("clienteMesa.noCerrarPush")
              : t("clienteMesa.noCerrar")}
          </p>
        </CustomerNotice>
      )}

      <div className="u-in flex flex-1 flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-1">
          <CustomerBrandHeader
            name={espera.branchName || brand.name}
            logoUrl={espera.logoUrl ?? brand.logoUrl}
          />
          <span className="mt-1 text-sm font-semibold uppercase tracking-widest text-suave">
            {t("clienteMesa.titulo")}
          </span>
          <span className="font-display text-6xl leading-none text-espera sm:text-7xl">
            {espera.name}
          </span>
          <span className="mt-1 text-base text-suave">
            {espera.partySize}{" "}
            {espera.partySize === 1
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
                ? "bg-alerta-fondo"
                : esOk
                  ? "bg-espera/20"
                  : "bg-espera/10"
            }`}
          />
          {!cerrado && !avisado && (
            <span className="pointer-events-none absolute inset-0 m-auto size-52 animate-ping rounded-full bg-espera/15 sm:size-56" />
          )}
          <div
            key={`${
              cancelado
                ? "cancel"
                : sentado
                  ? "sentado"
                  : avisado
                    ? "ok"
                    : "bell"
            }-${tick}`}
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
              <p className="font-display text-3xl uppercase tracking-tight text-alerta">
                {t("clienteMesa.canceladoTitulo")}
              </p>
              <p className="mt-2 text-base leading-relaxed text-suave">
                {t("clienteMesa.canceladoSub")}
              </p>
            </>
          ) : sentado ? (
            <>
              <p className="font-display text-3xl uppercase tracking-tight text-espera">
                {t("clienteMesa.sentadoTitulo", {
                  n: String(espera.tableNumber ?? ""),
                })}
              </p>
              <p className="mt-2 max-w-sm text-base leading-relaxed text-suave">
                {t("clienteMesa.sentadoSub")}
              </p>
            </>
          ) : avisado ? (
            <>
              <p className="font-display text-3xl uppercase tracking-tight text-espera">
                {t("clienteMesa.listoTitulo")}
              </p>
              <p className="mt-2 text-base leading-relaxed text-suave">{t("clienteMesa.listoSub")}</p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl uppercase tracking-tight text-carbon sm:text-3xl">
                {t("clienteMesa.esperandoTitulo")}
              </p>
              <p className="mt-2 max-w-sm text-base leading-relaxed text-suave">
                {t("clienteMesa.esperandoSub")}
              </p>
            </>
          )}
        </div>

        {waiting && espera.cola && (
          <div className="u-in mt-6 w-full rounded-2xl border border-espera/25 bg-espera/10 px-4 py-3 text-sm text-espera sm:max-w-sm">
            <p className="font-semibold">
              {espera.cola.gruposDelante <= 0
                ? t("clienteMesa.colaPrimero")
                : t("clienteMesa.colaDelante", {
                    g: String(espera.cola.gruposDelante),
                    gLabel:
                      espera.cola.gruposDelante === 1
                        ? t("clienteMesa.colaGrupo")
                        : t("clienteMesa.colaGrupos"),
                    be:
                      espera.cola.gruposDelante === 1 ? "is" : "are",
                  })}
            </p>
          </div>
        )}

        {!cerrado && (
          <div className="u-in mt-8 flex w-full flex-col gap-3 sm:max-w-sm">
            {pushDisponible ? (
              pushActivo ? (
                <p className="rounded-2xl border border-espera/40 bg-espera/10 px-4 py-3 text-sm font-semibold text-espera">
                  {t("clienteMesa.activados")}
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void activarAvisos()}
                    disabled={pushCargando}
                    className="min-h-14 w-full rounded-full bg-espera px-6 text-base font-semibold text-crema shadow-sm transition hover:bg-espera-fuerte active:scale-95 disabled:opacity-70"
                  >
                    {pushCargando
                      ? t("clienteMesa.pushCargando")
                      : t("clienteMesa.activar")}
                  </button>
                  {pushError && (
                    <p className="text-center text-sm text-alerta">
                      {pushError}
                    </p>
                  )}
                </>
              )
            ) : (
              <p className="rounded-2xl border border-linea bg-carbon/[0.04] px-4 py-3.5 text-base leading-snug text-carbon">
                {t("clienteMesa.mantenerPestana")}
              </p>
            )}
            {puedeCancelar && (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="min-h-12 w-full rounded-full border-2 border-alerta-borde px-6 text-base font-semibold text-carbon transition active:scale-95"
              >
                {t("clienteMesa.cancelarBtn")}
              </button>
            )}
          </div>
        )}
      </div>

      <p className="mt-8 text-sm text-suave">
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
          <p className="mt-2 text-base leading-relaxed text-suave">
            {t("clienteMesa.confirmarCancelSub")}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              disabled={cancelando}
              onClick={() => void confirmarCancelar()}
              className="min-h-12 w-full rounded-full bg-alerta px-5 text-base font-semibold text-crema transition disabled:opacity-60"
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
    </CustomerBrandShell>
  );
};

"use client";

import { useEffect, useRef, useState } from "react";
import { ModalShell } from "@/components/ui/ModalShell";
import { ThemedImg } from "@/components/ui/ThemedImg";
import { useApp } from "@/components/providers/Providers";

const AUTO_MS = 4200;
const SWIPE_MIN = 48;

type Flow = "pedidos" | "espera";

type Step = {
  key: string;
  img: "bell" | "chef" | "ok";
  float?: boolean;
  accent: "amber" | "brand" | "green" | "espera";
};

const STEPS_PEDIDOS: Step[] = [
  { key: "scan", img: "bell", float: true, accent: "brand" },
  { key: "espera", img: "chef", float: true, accent: "amber" },
  { key: "aviso", img: "bell", float: true, accent: "amber" },
  { key: "listo", img: "ok", accent: "green" },
];

const STEPS_ESPERA: Step[] = [
  { key: "scan", img: "bell", float: true, accent: "espera" },
  { key: "cola", img: "chef", float: true, accent: "amber" },
  { key: "aviso", img: "bell", float: true, accent: "espera" },
  { key: "mesa", img: "ok", accent: "green" },
];

export const CustomerWalkthrough = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const { t, locale } = useApp();
  const [flow, setFlow] = useState<Flow>("pedidos");
  const [i, setI] = useState(0);
  const touchX = useRef<number | null>(null);
  const steps = flow === "pedidos" ? STEPS_PEDIDOS : STEPS_ESPERA;

  useEffect(() => {
    if (!open) return;
    setI(0);
    setFlow("pedidos");
  }, [open]);

  useEffect(() => {
    setI(0);
  }, [flow]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      setI((prev) => (prev + 1) % steps.length);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [open, i, steps.length]);

  if (!open) return null;

  const step = steps[i];
  const accentBg =
    step.accent === "green"
      ? "bg-emerald-400/15"
      : step.accent === "amber"
        ? "bg-amber-400/15"
        : step.accent === "espera"
          ? "bg-espera/15"
          : "bg-marca/12";

  const go = (dir: -1 | 1) => {
    setI((p) => (p + dir + steps.length) % steps.length);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.changedTouches[0]?.clientX ?? null;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const x = e.changedTouches[0]?.clientX ?? touchX.current;
    const dx = x - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < SWIPE_MIN) return;
    go(dx < 0 ? 1 : -1);
  };

  const pushText =
    flow === "espera"
      ? t("home.walk.mesaPush")
      : t("home.walk.push");
  const labelModo =
    flow === "espera"
      ? locale === "en"
        ? "Table wait"
        : "Espera de mesa"
      : t("modo.pedido");
  const headline =
    flow === "espera" ? "García" : "42";
  const headlineColor =
    flow === "espera" ? "text-espera" : "text-marca";
  const stepCopyKey =
    flow === "espera"
      ? `home.walk.mesa.${step.key}`
      : `home.walk.${step.key}`;

  return (
    <ModalShell onClose={onClose} labelledBy="walk-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-[11px] font-semibold uppercase tracking-[0.25em] ${
              flow === "espera" ? "text-espera" : "text-marca"
            }`}
          >
            {t("home.walk.kicker")}
          </p>
          <h2
            id="walk-title"
            className="mt-1 font-display text-xl uppercase leading-tight tracking-tight text-carbon sm:text-2xl"
          >
            {t("home.walk.titulo")}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex min-h-11 shrink-0 items-center justify-center rounded-full border border-linea px-4 text-sm font-semibold text-carbon/60 hover:bg-carbon/5 sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-xs"
        >
          {t("home.walk.cerrar")}
        </button>
      </div>

      <div
        className="mt-4 flex rounded-2xl border border-linea bg-crema/50 p-1"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={flow === "pedidos"}
          onClick={() => setFlow("pedidos")}
          className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition sm:text-sm ${
            flow === "pedidos"
              ? "bg-marca text-crema"
              : "text-carbon/55 hover:bg-carbon/5"
          }`}
        >
          {locale === "en" ? "Order ready" : "Pedido listo"}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={flow === "espera"}
          onClick={() => setFlow("espera")}
          className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition sm:text-sm ${
            flow === "espera"
              ? "bg-espera text-crema"
              : "text-carbon/55 hover:bg-carbon/5"
          }`}
        >
          {locale === "en" ? "Table wait" : "Espera de mesa"}
        </button>
      </div>

      <div
        className="mx-auto mt-4 w-full max-w-[280px] touch-pan-y select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="overflow-hidden rounded-[2.1rem] border-2 border-carbon/15 bg-crema p-2.5 shadow-inner sm:p-3">
          <div className="mx-auto mb-2 h-1.5 w-14 rounded-full bg-carbon/15" />
          <div className="relative flex h-[min(320px,42dvh)] flex-col items-center overflow-hidden rounded-[1.6rem] bg-surface px-4 pt-4 text-center sm:h-[360px]">
            {step.key === "aviso" && (
              <div className="u-pop absolute inset-x-2 top-2 z-20 rounded-[14px] bg-[#f2f2f7] px-3 py-2.5 text-left shadow-lg ring-1 ring-black/10">
                <div className="flex items-start gap-2.5">
                  <img
                    src="/icon-192.png"
                    alt=""
                    className={`mt-0.5 size-8 shrink-0 rounded-[8px] object-cover ${
                      flow === "espera" ? "bg-[#0f766e]" : "bg-[#2536d4]"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[#1c1c1e]">
                        Cicalino
                      </p>
                      <span className="text-[10px] text-[#8e8e93]">ahora</span>
                    </div>
                    <p className="mt-0.5 text-xs font-medium leading-snug text-[#3a3a3c]">
                      {pushText}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <span
              className={`text-[11px] font-semibold text-carbon/45 ${
                step.key === "aviso" ? "mt-16" : ""
              }`}
            >
              Café Aroma
            </span>
            <span className="mt-0.5 text-[10px] uppercase tracking-widest text-carbon/35">
              {labelModo}
            </span>
            <span
              className={`mt-1 font-display text-5xl leading-none ${headlineColor}`}
            >
              {headline}
            </span>

            <div className="relative my-3 flex size-28 shrink-0 items-center justify-center sm:my-5 sm:size-36">
              <span
                className={`pointer-events-none absolute inset-0 m-auto size-24 rounded-full transition-colors duration-500 sm:size-28 ${accentBg}`}
              />
              {(step.accent === "amber" || step.accent === "espera") &&
                step.key !== "mesa" &&
                step.key !== "listo" && (
                  <span
                    className={`pointer-events-none absolute inset-0 m-auto size-24 animate-ping rounded-full sm:size-28 ${
                      step.accent === "espera"
                        ? "bg-espera/10"
                        : "bg-amber-400/10"
                    }`}
                  />
                )}
              <div
                key={`${flow}-${step.key}-${i}`}
                className={`relative z-10 flex size-full items-center justify-center ${
                  step.float ? "u-float" : "u-pop"
                }`}
              >
                <ThemedImg
                  name={step.img}
                  alt=""
                  className="h-24 w-auto object-contain sm:h-28"
                />
              </div>
            </div>

            {(step.key === "listo" || step.key === "mesa") && (
              <p className="mt-1 px-2 text-sm font-semibold text-emerald-600">
                {flow === "espera"
                  ? t("home.walk.mesa.mesaTitulo")
                  : t("cliente.listoTitulo")}
              </p>
            )}
          </div>
        </div>

        <p
          key={`txt-${flow}-${i}`}
          className="u-in mt-4 min-h-[2.5rem] text-center text-sm font-medium leading-snug text-carbon/75"
        >
          {t(stepCopyKey)}
        </p>
        <p className="mt-1 text-center text-[11px] text-carbon/40">
          {t("home.walk.swipe")}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        {steps.map((s, idx) => (
          <button
            key={`${flow}-${s.key}`}
            type="button"
            aria-label={t(stepCopyKey)}
            aria-current={idx === i}
            onClick={() => setI(idx)}
            className={`h-2 rounded-full transition-all ${
              idx === i
                ? flow === "espera"
                  ? "w-7 bg-espera"
                  : "w-7 bg-marca"
                : "w-2 bg-carbon/20 hover:bg-carbon/35"
            }`}
          />
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => go(-1)}
          className="flex min-h-12 flex-1 items-center justify-center rounded-full border border-linea text-sm font-semibold text-carbon/70 hover:bg-carbon/5"
        >
          {t("home.walk.prev")}
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          className={`flex min-h-12 flex-1 items-center justify-center rounded-full text-sm font-semibold text-crema ${
            flow === "espera"
              ? "bg-espera hover:bg-espera-fuerte"
              : "bg-marca hover:bg-marca-fuerte"
          }`}
        >
          {t("home.walk.next")}
        </button>
      </div>
    </ModalShell>
  );
};

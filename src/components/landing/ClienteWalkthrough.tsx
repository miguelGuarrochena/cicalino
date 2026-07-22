"use client";

import { useEffect, useState } from "react";
import { ModalShell } from "@/components/ui/ModalShell";
import { ThemedImg } from "@/components/ui/ThemedImg";
import { useApp } from "@/components/providers/Providers";

const AUTO_MS = 3800;

type Step = {
  key: string;
  img: "bell" | "chef" | "ok";
  float?: boolean;
  accent: "amber" | "brand" | "green";
};

const STEPS: Step[] = [
  { key: "scan", img: "bell", float: true, accent: "brand" },
  { key: "espera", img: "chef", float: true, accent: "amber" },
  { key: "aviso", img: "chef", float: true, accent: "amber" },
  { key: "listo", img: "ok", accent: "green" },
];

export const ClienteWalkthrough = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const { t } = useApp();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!open) return;
    setI(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      setI((prev) => (prev + 1) % STEPS.length);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [open, i]); // reinicia el timer al cambiar de paso (auto o manual)

  if (!open) return null;

  const step = STEPS[i];
  const accentBg =
    step.accent === "green"
      ? "bg-emerald-400/15"
      : step.accent === "amber"
        ? "bg-amber-400/15"
        : "bg-marca/12";

  return (
    <ModalShell onClose={onClose} labelledBy="walk-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-marca">
            {t("home.walk.kicker")}
          </p>
          <h2
            id="walk-title"
            className="mt-1 font-display text-2xl uppercase tracking-tight text-carbon"
          >
            {t("home.walk.titulo")}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/60 hover:bg-carbon/5"
        >
          {t("home.walk.cerrar")}
        </button>
      </div>

      {/* Teléfono mock */}
      <div className="mx-auto mt-5 w-full max-w-[260px]">
        <div className="rounded-[2rem] border-2 border-carbon/15 bg-crema p-3 shadow-inner">
          <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-carbon/15" />
          <div className="flex flex-col items-center rounded-[1.4rem] bg-surface px-4 pb-6 pt-5 text-center">
            <span className="text-[11px] font-semibold text-carbon/45">
              La Esquina
            </span>
            <span className="mt-0.5 text-[10px] uppercase tracking-widest text-carbon/35">
              {t("modo.pedido")}
            </span>
            <span className="mt-1 font-display text-5xl leading-none text-marca">
              42
            </span>

            <div className="relative my-4 flex size-36 items-center justify-center">
              <span
                className={`pointer-events-none absolute inset-0 m-auto size-28 rounded-full transition-colors duration-500 ${accentBg}`}
              />
              {step.accent === "amber" && (
                <span className="pointer-events-none absolute inset-0 m-auto size-28 animate-ping rounded-full bg-amber-400/10" />
              )}
              <div
                key={`${step.key}-${i}`}
                className={`relative z-10 flex size-full items-center justify-center ${
                  step.float ? "u-float" : "u-pop"
                }`}
              >
                <ThemedImg
                  name={step.img}
                  alt=""
                  className="h-28 w-auto object-contain"
                />
              </div>
            </div>

            {step.key === "aviso" && (
              <div className="u-pop mb-3 w-full rounded-2xl border border-marca/20 bg-marca/10 px-3 py-2 text-left">
                <p className="text-[10px] font-bold uppercase tracking-wide text-marca">
                  Cicalino
                </p>
                <p className="text-xs font-medium text-carbon">
                  {t("home.walk.push")}
                </p>
              </div>
            )}

            <p
              key={`txt-${i}`}
              className="u-in min-h-[2.75rem] text-sm font-medium text-carbon/75"
            >
              {t(`home.walk.${step.key}`)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2">
        {STEPS.map((s, idx) => (
          <button
            key={s.key}
            type="button"
            aria-label={t(`home.walk.${s.key}`)}
            aria-current={idx === i}
            onClick={() => setI(idx)}
            className={`h-2 rounded-full transition-all ${
              idx === i ? "w-7 bg-marca" : "w-2 bg-carbon/20 hover:bg-carbon/35"
            }`}
          />
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setI((p) => (p - 1 + STEPS.length) % STEPS.length)}
          className="flex-1 rounded-full border border-linea py-2.5 text-sm font-semibold text-carbon/70 hover:bg-carbon/5"
        >
          {t("home.walk.prev")}
        </button>
        <button
          type="button"
          onClick={() => setI((p) => (p + 1) % STEPS.length)}
          className="flex-1 rounded-full bg-marca py-2.5 text-sm font-semibold text-crema hover:bg-marca-fuerte"
        >
          {t("home.walk.next")}
        </button>
      </div>
    </ModalShell>
  );
};

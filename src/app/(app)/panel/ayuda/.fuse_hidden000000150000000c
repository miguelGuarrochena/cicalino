"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useApp } from "@/components/providers/Providers";
import type { AyudaSeccion } from "@/components/panel/HelpLink";

type Paso = { t: string; d: string };

const SECCIONES: {
  id: AyudaSeccion;
  accent: "marca" | "espera" | "carbon";
  href?: string;
  pasos: Paso[];
  tips?: string[];
}[] = [
  {
    id: "pedidos",
    accent: "marca",
    href: "/panel",
    pasos: [
      { t: "ayuda.pedidos.p1t", d: "ayuda.pedidos.p1d" },
      { t: "ayuda.pedidos.p2t", d: "ayuda.pedidos.p2d" },
      { t: "ayuda.pedidos.p3t", d: "ayuda.pedidos.p3d" },
      { t: "ayuda.pedidos.p4t", d: "ayuda.pedidos.p4d" },
      { t: "ayuda.pedidos.p5t", d: "ayuda.pedidos.p5d" },
      { t: "ayuda.pedidos.p6t", d: "ayuda.pedidos.p6d" },
    ],
    tips: ["ayuda.pedidos.tip1", "ayuda.pedidos.tip2"],
  },
  {
    id: "espera",
    accent: "espera",
    href: "/panel/espera",
    pasos: [
      { t: "ayuda.espera.p1t", d: "ayuda.espera.p1d" },
      { t: "ayuda.espera.p2t", d: "ayuda.espera.p2d" },
      { t: "ayuda.espera.p3t", d: "ayuda.espera.p3d" },
      { t: "ayuda.espera.p4t", d: "ayuda.espera.p4d" },
      { t: "ayuda.espera.p5t", d: "ayuda.espera.p5d" },
      { t: "ayuda.espera.p6t", d: "ayuda.espera.p6d" },
      { t: "ayuda.espera.p7t", d: "ayuda.espera.p7d" },
    ],
    tips: ["ayuda.espera.tip1", "ayuda.espera.tip2"],
  },
  {
    id: "config",
    accent: "carbon",
    href: "/panel/config",
    pasos: [
      { t: "ayuda.config.p1t", d: "ayuda.config.p1d" },
      { t: "ayuda.config.p2t", d: "ayuda.config.p2d" },
      { t: "ayuda.config.p3t", d: "ayuda.config.p3d" },
      { t: "ayuda.config.p4t", d: "ayuda.config.p4d" },
      { t: "ayuda.config.p5t", d: "ayuda.config.p5d" },
    ],
    tips: ["ayuda.config.tip1"],
  },
  {
    id: "metricas",
    accent: "carbon",
    href: "/panel/metrics",
    pasos: [
      { t: "ayuda.metricas.p1t", d: "ayuda.metricas.p1d" },
      { t: "ayuda.metricas.p2t", d: "ayuda.metricas.p2d" },
      { t: "ayuda.metricas.p3t", d: "ayuda.metricas.p3d" },
    ],
    tips: ["ayuda.metricas.tip1"],
  },
  {
    id: "general",
    accent: "carbon",
    pasos: [
      { t: "ayuda.general.p1t", d: "ayuda.general.p1d" },
      { t: "ayuda.general.p2t", d: "ayuda.general.p2d" },
      { t: "ayuda.general.p3t", d: "ayuda.general.p3d" },
      { t: "ayuda.general.p4t", d: "ayuda.general.p4d" },
    ],
  },
];

const accentRing = {
  marca: "border-marca/25 ring-marca/15",
  espera: "border-espera/25 ring-espera/15",
  carbon: "border-linea ring-carbon/5",
} as const;

const accentNum = {
  marca: "bg-marca text-crema",
  espera: "bg-espera text-crema",
  carbon: "bg-carbon/80 text-crema",
} as const;

const AyudaPage = () => {
  const { t } = useApp();

  useEffect(() => {
    const scrollHash = () => {
      const id = window.location.hash.replace("#", "");
      if (!id) return;
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    scrollHash();
    window.addEventListener("hashchange", scrollHash);
    return () => window.removeEventListener("hashchange", scrollHash);
  }, []);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-marca/70">
          {t("ayuda.kicker")}
        </p>
        <h1 className="font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
          {t("ayuda.titulo")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-carbon/60">
          {t("ayuda.sub")}
        </p>
      </header>

      <nav
        aria-label={t("ayuda.tocLabel")}
        className="flex flex-wrap gap-2 rounded-2xl border border-linea bg-surface p-3 shadow-sm"
      >
        {SECCIONES.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/70 transition hover:border-marca/40 hover:bg-marca/5 hover:text-marca"
          >
            {t(`ayuda.toc.${s.id}`)}
          </a>
        ))}
      </nav>

      {SECCIONES.map((s) => (
        <section
          key={s.id}
          id={s.id}
          className={`scroll-mt-24 rounded-[24px] border bg-surface p-5 shadow-sm ring-1 sm:p-7 ${accentRing[s.accent]}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl uppercase tracking-tight text-carbon">
                {t(`ayuda.${s.id}.titulo`)}
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-carbon/60">
                {t(`ayuda.${s.id}.intro`)}
              </p>
            </div>
            {s.href && (
              <Link
                href={s.href}
                className="shrink-0 rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/60 transition hover:border-marca/40 hover:text-marca"
              >
                {t("ayuda.irSeccion")}
              </Link>
            )}
          </div>

          <ol className="mt-6 flex flex-col gap-4">
            {s.pasos.map((p, i) => (
              <li key={p.t} className="flex gap-3 sm:gap-4">
                <span
                  className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${accentNum[s.accent]}`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-carbon">{t(p.t)}</p>
                  <p className="mt-1 text-sm leading-relaxed text-carbon/60">
                    {t(p.d)}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {s.tips && s.tips.length > 0 && (
            <div className="mt-6 rounded-2xl bg-crema/70 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-carbon/45">
                {t("ayuda.tipsLabel")}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {s.tips.map((tip) => (
                  <li
                    key={tip}
                    className="text-sm leading-relaxed text-carbon/65"
                  >
                    · {t(tip)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}

      <p className="text-center text-xs text-carbon/45">
        <Link
          href="/panel"
          className="font-semibold text-marca underline-offset-2 hover:underline"
        >
          {t("ayuda.volver")}
        </Link>
      </p>
    </div>
  );
};

export default AyudaPage;

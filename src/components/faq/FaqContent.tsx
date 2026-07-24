"use client";

import { useApp } from "@/components/providers/Providers";

const STEPS = [
  { key: "creado", color: "bg-amber-100 text-amber-800", ring: "ring-amber-200" },
  { key: "listo", color: "bg-emerald-100 text-emerald-800", ring: "ring-emerald-200" },
  { key: "retirado", color: "bg-carbon/5 text-carbon/55", ring: "ring-carbon/10" },
] as const;

const BLOQUES = [
  { q: "faq.q1", a: "faq.a1" },
  { q: "faq.q2", a: "faq.a2" },
  { q: "faq.q3", a: "faq.a3" },
  { q: "faq.q4", a: "faq.a4" },
  { q: "faq.q5", a: "faq.a5" },
  { q: "faq.q6", a: "faq.a6" },
  { q: "faq.q7", a: "faq.a7" },
  { q: "faq.q8", a: "faq.a8" },
] as const;

/** Ciclo de pedido + accordion de preguntas (landing y /faq). */
export const FaqContent = ({
  showFlow = true,
  className = "",
}: {
  showFlow?: boolean;
  className?: string;
}) => {
  const { t } = useApp();

  return (
    <div className={className}>
      {showFlow && (
        <section className="rounded-[28px] border border-linea bg-surface p-5 shadow-sm sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-carbon/55">
            {t("faq.flujoTitulo")}
          </h2>
          <p className="mt-1 text-sm text-carbon/50">{t("faq.flujoSub")}</p>

          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex flex-1 flex-col items-center sm:min-w-0">
                <div
                  className={`flex w-full flex-col items-center rounded-2xl px-3 py-4 text-center ring-2 ${s.color} ${s.ring}`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                    {i + 1}
                  </span>
                  <span className="mt-1 font-display text-lg uppercase leading-none tracking-tight sm:text-xl">
                    {t(`estado.${s.key}`)}
                  </span>
                  <span className="mt-2 text-[11px] leading-snug opacity-80">
                    {t(`faq.paso.${s.key}`)}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className="my-1 flex h-6 w-px bg-linea sm:hidden"
                    aria-hidden
                  />
                )}
              </div>
            ))}
          </div>

          <div
            className="mt-3 hidden justify-around px-10 text-carbon/30 sm:flex"
            aria-hidden
          >
            <span>→</span>
            <span>→</span>
          </div>

          <p className="mt-6 rounded-2xl bg-crema/60 px-4 py-3 text-sm leading-relaxed text-carbon/65">
            {t("faq.flujoNota")}
          </p>
        </section>
      )}

      <section className={`flex flex-col gap-3 ${showFlow ? "mt-8" : ""}`}>
        {BLOQUES.map((b) => (
          <details
            key={b.q}
            className="group rounded-2xl border border-linea bg-surface px-5 py-4 shadow-sm open:shadow-md"
          >
            <summary className="list-none font-semibold text-carbon marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-3">
                {t(b.q)}
                <span className="shrink-0 text-carbon/30 transition group-open:rotate-45">
                  +
                </span>
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-carbon/60">
              {t(b.a)}
            </p>
          </details>
        ))}
      </section>
    </div>
  );
};

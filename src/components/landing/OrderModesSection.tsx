"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/Providers";

/* Las dos modalidades de Pedidos en las que el cliente pide desde su celular:
 * Mesa (QR fijo por mesa, se prepara cuando está pago) y Mostrador QR (un QR
 * para todo el local, se prepara enseguida y se paga ahora o al retirar).
 * Mismo lenguaje visual que SplitBillSection. */
const MODOS = [
  { id: "mesa", pasos: ["paso1", "paso2", "paso3", "paso4"] },
  { id: "qr", pasos: ["paso1", "paso2", "paso3", "paso4"] },
] as const;

export const OrderModesSection = () => {
  const { t } = useApp();

  return (
    <section
      id="pedidos-desde-el-celular"
      className="scroll-mt-24 border-t border-linea/80 px-6 py-16 sm:px-8 sm:py-20"
    >
      <div className="mx-auto w-full max-w-5xl">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-marca">
            {t("home.modos.kicker")}
          </p>
          <h2 className="mt-2 font-display text-3xl uppercase tracking-tight text-carbon sm:text-5xl">
            {t("home.modos.titulo")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-carbon/65 sm:text-lg">
            {t("home.modos.sub")}
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {MODOS.map((m, idx) => (
            <article
              key={m.id}
              className="u-in flex flex-col rounded-[28px] border border-linea bg-surface p-5 sm:p-6"
              style={{ animationDelay: `${0.05 + idx * 0.07}s` }}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-marca">
                {t(`home.modos.${m.id}.etiqueta`)}
              </p>
              <h3 className="mt-1 font-display text-2xl uppercase tracking-tight text-carbon">
                {t(`home.modos.${m.id}.titulo`)}
              </h3>
              <p className="mt-1 text-sm text-carbon/55">{t(`home.modos.${m.id}.sub`)}</p>
              <ol className="mt-4 flex flex-1 flex-col gap-2.5">
                {m.pasos.map((p, i) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm text-carbon/80">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-marca/10 text-[11px] font-bold text-marca">
                      {i + 1}
                    </span>
                    {t(`home.modos.${m.id}.${p}`)}
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-xs text-carbon/55">{t(`home.modos.${m.id}.material`)}</p>
              <p className="mt-3 rounded-2xl bg-marca/8 px-4 py-3 text-sm font-semibold text-marca">
                {t(`home.modos.${m.id}.clave`)}
              </p>
            </article>
          ))}
        </div>

        <p className="u-in mx-auto mt-6 max-w-2xl text-center text-sm text-carbon/55">
          {t("home.modos.nota")}
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/probar"
            className="flex min-h-12 items-center justify-center rounded-full bg-marca px-7 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
          >
            {t("home.ctaProbar")}
          </Link>
        </div>
      </div>
    </section>
  );
};

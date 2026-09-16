"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/Providers";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const GUESTS = [
  {
    key: "juan",
    lines: [
      { key: "hamburguesa", amount: 10_000 },
      { key: "coca", amount: 2_000 },
    ],
    tipPct: 10,
    paid: true,
  },
  {
    key: "maria",
    lines: [
      { key: "pizza", amount: 15_000 },
      { key: "agua", amount: 2_000 },
    ],
    tipPct: 5,
    paid: false,
  },
] as const;

const guestTotals = GUESTS.map((g) => {
  const consumo = g.lines.reduce((s, l) => s + l.amount, 0);
  const tip = Math.round((consumo * g.tipPct) / 100);
  return { ...g, tip, total: consumo + tip };
});
const TABLE_TOTAL = guestTotals.reduce((s, g) => s + g.total, 0);
const PAID = guestTotals.filter((g) => g.paid).reduce((s, g) => s + g.total, 0);

const STEPS = ["escanea", "pedi", "dividi", "paga"] as const;
const CLIENT_ITEMS = [
  "consumo",
  "suyo",
  "iguales",
  "monto",
  "porcentaje",
  "propina",
  "metodo",
] as const;
const LOCAL_ITEMS = ["total", "pagado", "falta", "quien", "metodo", "historial"] as const;
const METHODS = ["mp", "transferencia", "efectivo", "tarjeta"] as const;

const Row = ({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
}) => (
  <div
    className={`flex items-baseline justify-between gap-3 ${
      strong ? "font-semibold text-carbon" : muted ? "text-carbon/55" : "text-carbon/75"
    }`}
  >
    <span>{label}</span>
    <span className="tabular-nums">{money.format(value)}</span>
  </div>
);

export const SplitBillSection = () => {
  const { t } = useApp();

  return (
    <section
      id="pagos-divididos"
      className="scroll-mt-24 border-y border-linea/80 bg-surface/60 px-6 py-16 sm:px-8 sm:py-20"
    >
      <div className="mx-auto w-full max-w-5xl">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-marca">
            {t("home.pagos.kicker")}
          </p>
          <h2 className="mt-2 font-display text-3xl uppercase tracking-tight text-carbon sm:text-5xl">
            {t("home.pagos.titulo")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-carbon/65 sm:text-lg">
            {t("home.pagos.sub")}
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[28px] border border-linea bg-surface p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-marca">
              {t("home.pagos.ladoCliente")}
            </p>
            <p className="mt-1 text-sm text-carbon/55">{t("home.pagos.ladoClienteSub")}</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {CLIENT_ITEMS.map((k) => (
                <li key={k} className="flex items-start gap-2.5 text-sm text-carbon/80">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-marca/10 text-[11px] font-bold text-marca">
                    ✓
                  </span>
                  {t(`home.pagos.cliente.${k}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[28px] border border-linea bg-surface p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-marca">
              {t("home.pagos.ladoLocal")}
            </p>
            <p className="mt-1 text-sm text-carbon/55">{t("home.pagos.ladoLocalSub")}</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {LOCAL_ITEMS.map((k) => (
                <li key={k} className="flex items-start gap-2.5 text-sm text-carbon/80">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    ✓
                  </span>
                  {t(`home.pagos.local.${k}`)}
                </li>
              ))}
            </ul>
            <p className="mt-5 rounded-2xl bg-marca/8 px-4 py-3 text-sm font-semibold text-marca">
              {t("home.pagos.cierra")}
            </p>
          </div>
        </div>

        <ol className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STEPS.map((s, idx) => (
            <li
              key={s}
              className="u-in relative flex flex-col rounded-2xl border border-linea bg-surface p-4"
              style={{ animationDelay: `${0.05 + idx * 0.07}s` }}
            >
              <span className="font-display text-3xl text-marca/25">0{idx + 1}</span>
              <h3 className="mt-1 font-display text-xl uppercase tracking-tight text-marca">
                {t(`home.pagos.paso.${s}.titulo`)}
              </h3>
              <p className="mt-1.5 text-sm text-carbon/65">{t(`home.pagos.paso.${s}.sub`)}</p>
              {idx < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="absolute -right-2.5 top-1/2 hidden size-5 -translate-y-1/2 place-items-center rounded-full bg-marca text-[11px] text-crema sm:grid"
                >
                  →
                </span>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="u-in flex flex-col gap-4">
            <ul className="flex flex-col gap-3">
              {(["cuenta", "modos", "propina", "local"] as const).map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    ✓
                  </span>
                  <div>
                    <p className="font-semibold text-carbon">{t(`home.pagos.beneficio.${b}.titulo`)}</p>
                    <p className="text-sm text-carbon/60">{t(`home.pagos.beneficio.${b}.sub`)}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-carbon/50">
                {t("home.pagos.metodosTitulo")}
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {METHODS.map((m) => (
                  <li
                    key={m}
                    className="rounded-full border border-linea bg-surface px-3 py-1 text-xs font-semibold text-carbon/70"
                  >
                    {t(`home.pagos.metodo.${m}`)}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Link
                href="/probar"
                className="flex min-h-12 items-center justify-center rounded-full bg-marca px-7 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
              >
                {t("home.ctaProbar")}
              </Link>
              <Link
                href="/pricing"
                className="flex min-h-12 items-center justify-center rounded-full border-2 border-marca px-6 text-sm font-semibold text-marca transition hover:bg-marca hover:text-crema active:scale-95"
              >
                {t("home.pagos.ctaPrecio")}
              </Link>
            </div>
          </div>

          <div
            className="u-in rounded-[28px] border border-linea bg-crema/70 p-4 shadow-sm sm:p-5"
            role="img"
            aria-label={t("home.pagos.mockAria")}
          >
            <p className="flex items-baseline justify-between">
              <span className="font-display text-2xl uppercase text-marca">{t("home.pagos.mock.mesa")}</span>
              <span className="text-xs text-carbon/50">{t("home.pagos.mock.comensales")}</span>
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {guestTotals.map((g) => (
                <div
                  key={g.key}
                  className={`flex flex-col gap-1 rounded-2xl border bg-surface p-3 text-sm ${
                    g.paid ? "border-emerald-400/60" : "border-amber-400/60"
                  }`}
                >
                  <p className="font-semibold text-carbon">{t(`home.pagos.mock.${g.key}`)}</p>
                  {g.lines.map((l) => (
                    <Row key={l.key} label={t(`home.pagos.mock.${l.key}`)} value={l.amount} />
                  ))}
                  <Row
                    label={t("home.pagos.mock.propina", { n: g.tipPct })}
                    value={g.tip}
                    muted
                  />
                  <div className="my-1 border-t border-linea" />
                  <Row label={t("home.pagos.mock.total")} value={g.total} strong />
                  <span
                    className={`mt-1 inline-flex self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      g.paid
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                    }`}
                  >
                    {g.paid
                      ? `✓ ${t("home.pagos.mock.pagado")} · ${t("home.pagos.metodo.mp")}`
                      : `⏳ ${t("home.pagos.mock.pendiente")}`}
                  </span>
                </div>
              ))}
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ["totalMesa", TABLE_TOTAL, "text-carbon"],
                  ["pagado", PAID, "text-emerald-700 dark:text-emerald-300"],
                  ["pendiente", TABLE_TOTAL - PAID, "text-amber-700 dark:text-amber-300"],
                ] as const
              ).map(([k, v, cls]) => (
                <div key={k} className="rounded-2xl border border-linea bg-surface px-2 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-carbon/50">
                    {t(`home.pagos.mock.${k}`)}
                  </dt>
                  <dd className={`font-display text-base tabular-nums sm:text-lg ${cls}`}>
                    {money.format(v)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-center text-xs font-medium text-carbon/60">
              {t("home.pagos.mock.historial")}
            </p>
            <p className="mt-1 text-center text-xs text-carbon/45">{t("home.pagos.mock.nota")}</p>
          </div>
        </div>
      </div>
    </section>
  );
};

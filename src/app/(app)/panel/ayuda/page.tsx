"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/providers/Providers";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import type { AyudaSeccion } from "@/components/panel/HelpLink";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
/* Las tres formas de tomar pedidos que explica la ayuda. No es el valor de la
 * base: el mostrador es tradicional o QR, y Mesa va aparte (puede sumarse). */
type VistaPedidos = "mostrador" | "mesa" | "mostrador_qr";

type Paso = { t: string; d: string };

/* `pasosMesa` es Pedidos en modalidad Mesa: el cliente pide y paga desde el
 * QR de su mesa. `pasosQr` es Mostrador QR: un QR para todo el local, el
 * pedido se prepara enseguida y se paga ahora o al retirar. Son otros flujos,
 * no un paso más, así que reemplazan la lista en vez de sumarse. La sección
 * de Pedidos deja ver cualquiera de las tres modalidades (arranca en la de la
 * sucursal), así se puede entender la otra antes de cambiarla. */
const SECCIONES: {
  id: AyudaSeccion;
  accent: "marca" | "espera" | "pagos" | "carbon";
  href?: string;
  pasos: Paso[];
  pasosMesa?: Paso[];
  pasosQr?: Paso[];
  tips?: string[];
  tipsMesa?: string[];
  tipsQr?: string[];
}[] = [
  {
    id: "pedidos",
    accent: "marca",
    href: "/panel/pedidos",
    pasos: [
      { t: "ayuda.pedidos.p1t", d: "ayuda.pedidos.p1d" },
      { t: "ayuda.pedidos.p2t", d: "ayuda.pedidos.p2d" },
      { t: "ayuda.pedidos.p3t", d: "ayuda.pedidos.p3d" },
      { t: "ayuda.pedidos.p4t", d: "ayuda.pedidos.p4d" },
      { t: "ayuda.pedidos.p5t", d: "ayuda.pedidos.p5d" },
      { t: "ayuda.pedidos.p6t", d: "ayuda.pedidos.p6d" },
    ],
    pasosMesa: [
      { t: "ayuda.pedidos.m1t", d: "ayuda.pedidos.m1d" },
      { t: "ayuda.pedidos.m2t", d: "ayuda.pedidos.m2d" },
      { t: "ayuda.pedidos.m3t", d: "ayuda.pedidos.m3d" },
      { t: "ayuda.pedidos.m4t", d: "ayuda.pedidos.m4d" },
      { t: "ayuda.pedidos.m5t", d: "ayuda.pedidos.m5d" },
      { t: "ayuda.pedidos.m6t", d: "ayuda.pedidos.m6d" },
    ],
    tips: ["ayuda.pedidos.tip1", "ayuda.pedidos.tip2"],
    tipsMesa: ["ayuda.pedidos.tipMesa1", "ayuda.pedidos.tipMesa2"],
    pasosQr: [
      { t: "ayuda.pedidos.q1t", d: "ayuda.pedidos.q1d" },
      { t: "ayuda.pedidos.q2t", d: "ayuda.pedidos.q2d" },
      { t: "ayuda.pedidos.q3t", d: "ayuda.pedidos.q3d" },
      { t: "ayuda.pedidos.q4t", d: "ayuda.pedidos.q4d" },
      { t: "ayuda.pedidos.q5t", d: "ayuda.pedidos.q5d" },
    ],
    tipsQr: [
      "ayuda.pedidos.tipQr1",
      "ayuda.pedidos.tipQr2",
      "ayuda.pedidos.tipQr3",
      "ayuda.pedidos.tipQr4",
    ],
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
    id: "pagos",
    accent: "pagos",
    href: "/panel/pagos",
    pasos: [
      { t: "ayuda.pagos.p1t", d: "ayuda.pagos.p1d" },
      { t: "ayuda.pagos.p2t", d: "ayuda.pagos.p2d" },
      { t: "ayuda.pagos.p3t", d: "ayuda.pagos.p3d" },
      { t: "ayuda.pagos.p4t", d: "ayuda.pagos.p4d" },
      { t: "ayuda.pagos.p5t", d: "ayuda.pagos.p5d" },
      { t: "ayuda.pagos.p6t", d: "ayuda.pagos.p6d" },
    ],
    tips: ["ayuda.pagos.tip1", "ayuda.pagos.tip2"],
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
    tips: ["ayuda.config.tip1", "ayuda.config.tip2"],
  },
  {
    id: "metricas",
    accent: "carbon",
    href: "/panel/config/metricas",
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

/* Lo que cambia entre Mesa y Mostrador QR, fila por fila. */
const DIFERENCIAS = ["qr", "pedido", "pago", "preparacion", "listo", "cancelar"] as const;

/* Los materiales para imprimir: dos por modalidad, con los mismos nombres
 * que el modal de descarga («Con instrucciones» / «Solo QR»). */
const MATERIALES = [
  { modalidad: "retiroConfig.mesa", marco: "mesaMarco", solo: "mesaSolo" },
  { modalidad: "retiroConfig.mostradorQr", marco: "qrMarco", solo: "qrSolo" },
] as const;

const accentRing = {
  marca: "border-marca/25 ring-marca/15",
  espera: "border-espera/25 ring-espera/15",
  pagos: "border-pagos/25 ring-pagos/15",
  carbon: "border-linea ring-carbon/5",
} as const;

const accentNum = {
  marca: "bg-marca text-crema",
  espera: "bg-espera text-crema",
  pagos: "bg-pagos text-crema",
  carbon: "bg-carbon/80 text-crema",
} as const;

const AyudaPage = () => {
  const { t } = useApp();
  const { pedidosEnMesa, pedidosMostradorQr, pedidosTradicional } = useOperationalAccess();
  /* Lo que usa la sucursal: puede ser más de una (mostrador + Mesa). */
  const enUso: Record<VistaPedidos, boolean> = {
    mostrador: pedidosTradicional,
    mesa: pedidosEnMesa,
    mostrador_qr: pedidosMostradorQr,
  };
  const modalidadLocal: VistaPedidos = pedidosMostradorQr
    ? "mostrador_qr"
    : pedidosTradicional
      ? "mostrador"
      : pedidosEnMesa
        ? "mesa"
        : "mostrador";
  /* Hasta que alguien elija otra pestaña, se ve la de la sucursal (que puede
   * llegar después del primer render, cuando hidrata la config). */
  const [elegida, setElegida] = useState<VistaPedidos | null>(null);
  const modalidad = elegida ?? modalidadLocal;

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

      {SECCIONES.map((s) => {
        const esPedidos = s.id === "pedidos";
        const enMesa = esPedidos && modalidad === "mesa";
        const enQr = esPedidos && modalidad === "mostrador_qr";
        const pasos =
          enMesa && s.pasosMesa ? s.pasosMesa : enQr && s.pasosQr ? s.pasosQr : s.pasos;
        const tips = enMesa && s.tipsMesa ? s.tipsMesa : enQr && s.tipsQr ? s.tipsQr : s.tips;
        return (
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
                {t(
                  enMesa
                    ? "ayuda.pedidos.introMesa"
                    : enQr
                      ? "ayuda.pedidos.introQr"
                      : `ayuda.${s.id}.intro`,
                )}
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

          {esPedidos && (
            <div className="mt-5">
              <SegmentedTabs
                ariaLabel={t("ayuda.pedidos.modalidadLabel")}
                value={modalidad}
                onChange={setElegida}
                options={[
                  { id: "mostrador", label: t("retiroConfig.mostrador") },
                  { id: "mesa", label: t("retiroConfig.mesa") },
                  { id: "mostrador_qr", label: t("retiroConfig.mostradorQr") },
                ]}
              />
              <p className="mt-3 text-sm leading-relaxed text-carbon/60">
                {t("ayuda.pedidos.combinaciones")}
              </p>
              <p className="mt-1 text-xs text-carbon/50">
                {t(
                  enUso[modalidad]
                    ? "ayuda.pedidos.modalidadActual"
                    : "ayuda.pedidos.modalidadOtra",
                )}
              </p>
            </div>
          )}

          <ol className="mt-6 flex flex-col gap-4">
            {pasos.map((p, i) => (
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

          {tips && tips.length > 0 && (
            <div className="mt-6 rounded-2xl bg-crema/70 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-carbon/45">
                {t("ayuda.tipsLabel")}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {tips.map((tip) => (
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

          {esPedidos && (
            <div className="mt-6 rounded-2xl border border-linea px-4 py-4 sm:px-5">
              <h3 className="font-semibold text-carbon">{t("ayuda.pedidos.difTitulo")}</h3>
              <p className="mt-1 text-sm leading-relaxed text-carbon/60">
                {t("ayuda.pedidos.difSub")}
              </p>
              <div
                className="mt-4 hidden grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 text-[10px] font-bold uppercase tracking-wide text-carbon/45 sm:grid"
                aria-hidden
              >
                <span />
                <span>{t("retiroConfig.mesa")}</span>
                <span>{t("retiroConfig.mostradorQr")}</span>
              </div>
              <dl className="mt-2 flex flex-col divide-y divide-linea/70">
                {DIFERENCIAS.map((d) => (
                  <div
                    key={d}
                    className="grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)] sm:gap-x-4"
                  >
                    <dt className="text-sm font-semibold text-carbon">
                      {t(`ayuda.pedidos.dif.${d}.label`)}
                    </dt>
                    <dd className="text-sm leading-relaxed text-carbon/65">
                      <span className="font-semibold text-carbon/80 sm:hidden">
                        {t("retiroConfig.mesa")}:{" "}
                      </span>
                      {t(`ayuda.pedidos.dif.${d}.mesa`)}
                    </dd>
                    <dd className="text-sm leading-relaxed text-carbon/65">
                      <span className="font-semibold text-carbon/80 sm:hidden">
                        {t("retiroConfig.mostradorQr")}:{" "}
                      </span>
                      {t(`ayuda.pedidos.dif.${d}.qr`)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {esPedidos && (
            <div className="mt-6 rounded-2xl border border-linea px-4 py-4 sm:px-5">
              <h3 className="font-semibold text-carbon">{t("ayuda.pedidos.matTitulo")}</h3>
              <p className="mt-1 text-sm leading-relaxed text-carbon/60">
                {t("ayuda.pedidos.matSub")}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {MATERIALES.map((m) => (
                  <div key={m.marco} className="rounded-2xl bg-crema/70 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-carbon/45">
                      {t(m.modalidad)}
                    </p>
                    <dl className="mt-2 flex flex-col gap-2.5">
                      {([
                        ["mesasQr.descargarMarco", m.marco],
                        ["mesasQr.descargarSolo", m.solo],
                      ] as const).map(([variante, texto]) => (
                        <div key={texto}>
                          <dt className="text-sm font-semibold text-carbon">{t(variante)}</dt>
                          <dd className="mt-0.5 text-sm leading-relaxed text-carbon/65">
                            {t(`ayuda.pedidos.mat.${texto}`)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-carbon/60">
                {t("ayuda.pedidos.matNota")}
              </p>
            </div>
          )}
        </section>
        );
      })}

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

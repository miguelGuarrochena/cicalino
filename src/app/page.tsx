"use client";

import { useState } from "react";
import Link from "next/link";
import { ThemedImg } from "@/components/ui/ThemedImg";
import { Logo } from "@/components/ui/Logo";
import { Controls } from "@/components/ui/Controls";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { CustomerWalkthrough } from "@/components/landing/CustomerWalkthrough";
import { useApp } from "@/components/providers/Providers";

const Home = () => {
  const { t } = useApp();
  const [walkOpen, setWalkOpen] = useState(false);

  const shopSteps = [
    { key: "1", img: "bell" as const },
    { key: "2", img: "chef" as const },
    { key: "3", img: "ok" as const },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-crema">
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
        <Link
          href="/pricing"
          className="rounded-full border border-marca/25 bg-crema/70 px-4 py-2 text-xs font-semibold text-marca backdrop-blur transition hover:bg-marca hover:text-crema sm:text-sm"
        >
          {t("nav.precios")}
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="rounded-full bg-marca px-4 py-2 text-xs font-semibold text-crema transition hover:bg-marca-fuerte sm:px-5 sm:text-sm"
          >
            {t("nav.entrar")}
          </Link>
          <Controls />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero — fondo crema como antes, campana bien visible */}
        <section className="relative flex min-h-[85dvh] flex-col items-center justify-center overflow-hidden px-6 pb-12 pt-24 text-center sm:min-h-dvh sm:pb-16">
          <div className="u-in mb-6" style={{ animationDelay: "0.05s" }}>
            <Logo linked={false} className="h-14 sm:h-16" />
          </div>

          <h1
            className="u-in font-display text-5xl uppercase leading-[0.9] tracking-tight text-marca sm:text-6xl md:text-7xl"
            style={{ animationDelay: "0.12s" }}
          >
            {t("home.h1a")}
            <br />
            {t("home.h1b")}
            <br />
            {t("home.h1c")}
          </h1>

          <div className="u-in my-10" style={{ animationDelay: "0.22s" }}>
            <ThemedImg
              name="bell"
              alt="Cicalino"
              className="u-float h-52 sm:h-60 md:h-64"
            />
          </div>

          <p
            className="u-in max-w-xl text-lg font-medium text-marca/85 sm:text-xl"
            style={{ animationDelay: "0.3s" }}
          >
            {t("home.sub")}
          </p>

          <div
            className="u-in mt-9 flex flex-col items-center gap-3"
            style={{ animationDelay: "0.38s" }}
          >
            <Link
              href="/login"
              className="rounded-full bg-marca px-8 py-3.5 text-base font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
            >
              {t("home.cta1")}
            </Link>
            <button
              type="button"
              onClick={() => setWalkOpen(true)}
              className="text-sm font-semibold text-marca/70 underline-offset-4 transition hover:text-marca hover:underline"
            >
              {t("home.ctaWalk")}
            </button>
          </div>
        </section>

        {/* Qué es */}
        <section className="mx-auto w-full max-w-3xl px-6 py-10 text-center sm:px-8 sm:py-14">
          <h2 className="u-in font-display text-3xl uppercase tracking-tight text-marca sm:text-4xl">
            {t("home.queTitulo")}
          </h2>
          <p className="u-in mx-auto mt-3 max-w-xl text-carbon/65 sm:text-lg">
            {t("home.queSub")}
          </p>
        </section>

        {/* Para el local */}
        <section className="mx-auto w-full max-w-4xl px-6 py-14 sm:px-8 sm:py-20">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-marca">
              {t("home.localKicker")}
            </p>
            <h2 className="mt-2 font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
              {t("home.localTitulo")}
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-carbon/60">
              {t("home.localSub")}
            </p>
          </div>

          <ol className="mt-12 flex flex-col gap-14">
            {shopSteps.map((p, idx) => (
              <li
                key={p.key}
                className={`u-in flex flex-col items-center gap-6 sm:flex-row sm:gap-10 ${
                  idx % 2 === 1 ? "sm:flex-row-reverse" : ""
                }`}
                style={{ animationDelay: `${0.05 + idx * 0.08}s` }}
              >
                <div className="flex flex-1 flex-col items-center sm:items-start">
                  <span className="font-display text-5xl text-marca/25">
                    0{p.key}
                  </span>
                  <h3 className="mt-1 font-display text-2xl uppercase tracking-tight text-carbon">
                    {t(`home.paso${p.key}Titulo`)}
                  </h3>
                  <p className="mt-2 max-w-sm text-center text-carbon/60 sm:text-left">
                    {t(`home.paso${p.key}Sub`)}
                  </p>
                </div>
                <div className="flex flex-1 items-center justify-center">
                  <ThemedImg
                    name={p.img}
                    alt=""
                    className={`h-36 w-auto sm:h-44 ${idx === 1 ? "u-float" : ""}`}
                  />
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Cliente */}
        <section className="border-y border-linea/80 bg-surface/60 px-6 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 text-center sm:flex-row sm:text-left">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-marca">
                {t("home.cliKicker")}
              </p>
              <h2 className="mt-2 font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
                {t("home.cliTitulo")}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-carbon/60 sm:mx-0">
                {t("home.cliSub")}
              </p>
              <button
                type="button"
                onClick={() => setWalkOpen(true)}
                className="mt-6 rounded-full border-2 border-marca px-6 py-3 text-sm font-semibold text-marca transition hover:bg-marca hover:text-crema active:scale-95"
              >
                {t("home.ctaWalk")}
              </button>
            </div>
            <div className="relative flex flex-1 items-center justify-center">
              <span className="pointer-events-none absolute size-40 rounded-full bg-emerald-400/15 sm:size-48" />
              <ThemedImg name="ok" alt="" className="u-float relative z-10 h-44 sm:h-52" />
            </div>
          </div>
        </section>

        {/* Cierre */}
        <section className="mx-auto w-full max-w-2xl px-6 py-16 text-center sm:py-20">
          <h2 className="font-display text-3xl uppercase tracking-tight text-marca sm:text-4xl">
            {t("home.cierreTitulo")}
          </h2>
          <p className="mt-3 text-carbon/60">{t("home.cierreSub")}</p>
          <Link
            href="/login"
            className="mt-8 inline-flex rounded-full bg-marca px-8 py-3.5 text-base font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
          >
            {t("home.cta1")}
          </Link>
        </section>
      </main>

      <SiteFooter />
      <CustomerWalkthrough open={walkOpen} onClose={() => setWalkOpen(false)} />
    </div>
  );
};
export default Home;

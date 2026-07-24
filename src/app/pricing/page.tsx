"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Controls } from "@/components/ui/Controls";
import { useApp } from "@/components/providers/Providers";
import { SiteFooter } from "@/components/ui/SiteFooter";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

// Contacto directo (sin pasarela). Solo por mail.
const MAIL = "info@cicalino.net";
const PRECIO_MENSUAL = 20000; // ARS por sucursal
const PRECIO_ANUAL = PRECIO_MENSUAL * 10; // 2 meses gratis

const PreciosPage = () => {
  const { locale } = useApp();
  const es = locale !== "en";
  const [anual, setAnual] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const copiarMail = async () => {
    try {
      await navigator.clipboard.writeText(MAIL);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      /* sin clipboard */
    }
  };

  const features = es
    ? [
        "Pedidos ilimitados",
        "QR + aviso al celular del cliente",
        "Mostrador, empleados con PIN",
        "Métricas del día",
        "1 sucursal incluida",
      ]
    : [
        "Unlimited orders",
        "QR + notice to the customer’s phone",
        "Counter app, staff with PIN",
        "Daily metrics",
        "1 branch included",
      ];

  const mailHref = () => {
    const subject = es ? "Cicalino — quiero activarlo" : "Cicalino — get started";
    const body = es
      ? "Hola,\n\nQuiero Cicalino.\n\nNombre del local:\nCiudad:\nSucursales:\n"
      : "Hi,\n\nI'd like Cicalino.\n\nBusiness name:\nCity:\nLocations:\n";
    return `mailto:${MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="flex min-h-dvh flex-col bg-crema">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo className="h-10 sm:h-12" />
        <Controls />
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-10 sm:py-14">
        <div className="u-in text-center">
          <h1 className="font-display text-4xl uppercase tracking-tight text-marca sm:text-5xl">
            {es ? "Precio claro" : "Clear pricing"}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-carbon/60">
            {es
              ? "Una tarifa fija por sucursal. Elegí mensual o anual, y lo activamos."
              : "A flat fee per branch. Pick monthly or yearly, and we set it up."}
          </p>
        </div>

        <div
          className="u-in mt-10 rounded-[28px] border border-marca bg-surface p-7 shadow-sm ring-2 ring-marca/25"
          style={{ animationDelay: "0.08s" }}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-marca">
              Cicalino
            </p>
            <div className="flex rounded-full border border-linea bg-crema/50 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setAnual(false)}
                className={`rounded-full px-3 py-1.5 transition ${
                  !anual ? "bg-marca text-crema" : "text-carbon/55"
                }`}
              >
                {es ? "Mensual" : "Monthly"}
              </button>
              <button
                type="button"
                onClick={() => setAnual(true)}
                className={`rounded-full px-3 py-1.5 transition ${
                  anual ? "bg-marca text-crema" : "text-carbon/55"
                }`}
              >
                {es ? "Anual" : "Yearly"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-baseline gap-1.5">
            <span className="font-display text-5xl text-marca">
              {money.format(anual ? PRECIO_ANUAL : PRECIO_MENSUAL)}
            </span>
            <span className="text-sm text-carbon/50">
              {anual
                ? es
                  ? "/año · por sucursal"
                  : "/yr · per branch"
                : es
                  ? "/mes · por sucursal"
                  : "/mo · per branch"}
            </span>
          </div>
          {anual && (
            <p className="mt-2 inline-block rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              {es ? "2 meses gratis 🎉" : "2 months free 🎉"}
            </p>
          )}

          <ul className="mt-6 flex flex-col gap-2.5">
            {features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-sm text-carbon/70"
              >
                <span className="mt-0.5 text-emerald-600">✓</span>
                {f}
              </li>
            ))}
          </ul>

          <p className="mt-5 text-sm text-carbon/55">
            {es
              ? `¿Varias sucursales? Se suma ${money.format(
                  anual ? PRECIO_ANUAL : PRECIO_MENSUAL,
                )} por cada una. Escribinos y armamos el total.`
              : `Several branches? Add ${money.format(
                  anual ? PRECIO_ANUAL : PRECIO_MENSUAL,
                )} per branch. Message us and we’ll set the total.`}
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/probar"
              className="rounded-full bg-marca px-5 py-3 text-center text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
            >
              {es ? "Probá 1 mes gratis" : "Start a free month"}
            </Link>
            <a
              href={mailHref()}
              className="rounded-full border border-linea px-5 py-2.5 text-center text-sm font-semibold text-carbon/70 transition hover:bg-carbon/5"
            >
              {es ? "O escribinos por mail" : "Or email us"}
            </a>
            <button
              type="button"
              onClick={copiarMail}
              className="mx-auto flex items-center gap-1.5 text-xs text-carbon/45 transition hover:text-carbon/70"
              title={es ? "Copiar mail" : "Copy email"}
            >
              {MAIL}
              {copiado ? (
                <span className="font-semibold text-emerald-600">
                  ✓ {es ? "copiado" : "copied"}
                </span>
              ) : (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-lg text-center text-sm text-carbon/55">
          {es
            ? "Te respondemos, coordinamos la transferencia y activamos."
            : "We reply, arrange a bank transfer and activate."}
        </p>

        <p className="mt-8 text-center text-xs text-carbon/50">
          <Link href="/" className="hover:underline">
            ← Volver al inicio
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
};

export default PreciosPage;

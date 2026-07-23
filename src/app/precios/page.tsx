"use client";

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

// Contacto directo (sin pasarela). Cambiá estos valores.
const MAIL = "hola@cicalino.ar";
const WA = "5491112345678"; // sin + ni espacios
const PRECIO_MENSUAL = 20000; // ARS por sucursal

const PreciosPage = () => {
  const { locale } = useApp();
  const es = locale !== "en";

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

  const waHref = () => {
    const msg = es
      ? "Hola! Quiero Cicalino para mi local."
      : "Hi! I'd like Cicalino for my venue.";
    return `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;
  };

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
            {es ? "Un precio, el producto" : "One price, the product"}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-carbon/60">
            {es
              ? "Gratis para tu cliente, siempre. Escribinos y lo activamos a mano."
              : "Free for your customers, always. Message us and we activate it by hand."}
          </p>
        </div>

        <div
          className="u-in mt-10 rounded-[28px] border border-marca bg-surface p-7 shadow-sm ring-2 ring-marca/25"
          style={{ animationDelay: "0.08s" }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-marca">
            Cicalino
          </p>

          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="font-display text-5xl text-marca">
              {money.format(PRECIO_MENSUAL)}
            </span>
            <span className="text-sm text-carbon/50">
              {es ? "/mes · por sucursal" : "/mo · per branch"}
            </span>
          </div>

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
              ? "¿Varias sucursales? Mismo producto: se suma $20.000 por cada una. Escribinos y armamos el total."
              : "Several branches? Same product: add the monthly fee per branch. Message us and we’ll set the total."}
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <a
              href={waHref()}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-marca px-5 py-3 text-center text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
            >
              WhatsApp
            </a>
            <a
              href={mailHref()}
              className="rounded-full border border-linea px-5 py-2.5 text-center text-sm font-semibold text-carbon/70 transition hover:bg-carbon/5"
            >
              {es ? "Escribir por mail" : "Email us"}
            </a>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-lg text-center text-sm text-carbon/55">
          {es
            ? "Te respondemos, coordinamos la transferencia y activamos. Sin Mercado Pago en el medio."
            : "We reply, arrange a bank transfer and activate. No Mercado Pago in between."}
        </p>

        <p className="mt-8 text-center text-xs text-carbon/50">
          <Link href="/" className="hover:underline">
            ← cicalino.ar
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
};

export default PreciosPage;

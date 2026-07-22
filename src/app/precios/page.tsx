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

// Contacto directo (sin pasarela): sin comisión de MP. Cambiá estos valores.
const MAIL = "hola@cicalino.ar";
const WA = "5491112345678"; // sin + ni espacios

const PreciosPage = () => {
  const { locale } = useApp();
  const es = locale !== "en";

  const planes = [
    {
      id: "prueba",
      nombre: es ? "Prueba" : "Trial",
      precio: 0,
      badge: es ? "14 días gratis" : "14 days free",
      destacado: false,
      features: es
        ? ["Todo incluido para probar", "Sin tarjeta", "Cancelás cuando quieras"]
        : ["Everything included", "No card required", "Cancel anytime"],
    },
    {
      id: "base",
      nombre: "Base",
      precio: 8000,
      badge: null,
      destacado: false,
      features: es
        ? [
            "1 local",
            "Pedidos ilimitados",
            "QR + avisos",
            "Métricas básicas",
            "Admin + empleados",
          ]
        : [
            "1 location",
            "Unlimited orders",
            "QR + notices",
            "Basic metrics",
            "Admin + staff",
          ],
    },
    {
      id: "pro",
      nombre: "Pro",
      precio: 15000,
      badge: es ? "Más elegido" : "Most popular",
      destacado: true,
      features: es
        ? [
            "Todo lo de Base",
            "Métricas por empleado y mesa",
            "Etiquetas NFC",
            "Soporte prioritario",
            "Multi-sucursal",
          ]
        : [
            "Everything in Base",
            "Metrics by staff & table",
            "NFC tags",
            "Priority support",
            "Multi-branch",
          ],
    },
  ];

  const waHref = (plan: string) => {
        const msg = es
          ? `Hola! Quiero el plan ${plan} de Cicalino.`
          : `Hi! I'd like the ${plan} plan on Cicalino.`;
        return `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;
      };

  const mailHref = (plan: string) => {
        const subject = es
          ? `Cicalino — plan ${plan}`
          : `Cicalino — ${plan} plan`;
        const body = es
          ? `Hola,\n\nQuiero contratar el plan ${plan}.\n\nNombre del local:\nCiudad:\n`
          : `Hi,\n\nI'd like the ${plan} plan.\n\nBusiness name:\nCity:\n`;
        return `mailto:${MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      };

  return (
    <div className="flex min-h-dvh flex-col bg-crema">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo className="h-10 sm:h-12" />
        <Controls />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:py-14">
        <div className="u-in text-center">
          <h1 className="font-display text-4xl uppercase tracking-tight text-marca sm:text-5xl">
            {es ? "Precios simples" : "Simple pricing"}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-carbon/60">
            {es
              ? "Gratis para tu cliente, siempre. Elegí un plan y escribinos: lo activamos a mano, sin comisiones de pasarela."
              : "Free for your customers, always. Pick a plan and message us — we activate it manually, no payment-gateway fees."}
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {planes.map((p, i) => (
            <div
              key={p.id}
              className={`u-in flex flex-col rounded-[28px] border bg-surface p-6 shadow-sm ${
                p.destacado
                  ? "border-marca ring-2 ring-marca/30"
                  : "border-linea"
              }`}
              style={{ animationDelay: `${0.05 + i * 0.07}s` }}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl uppercase tracking-tight text-carbon">
                  {p.nombre}
                </h2>
                {p.badge && (
                  <span className="rounded-full bg-marca/12 px-3 py-1 text-[11px] font-bold uppercase text-marca">
                    {p.badge}
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-4xl text-marca">
                  {p.precio === 0
                    ? es
                      ? "$0"
                      : "$0"
                    : money.format(p.precio)}
                </span>
                {p.precio > 0 && (
                  <span className="text-sm text-carbon/50">
                    {es ? "/mes" : "/mo"}
                  </span>
                )}
              </div>

              <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                {p.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-carbon/70"
                  >
                    <span className="mt-0.5 text-emerald-600">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-col gap-2">
                <a
                  href={waHref(p.nombre)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`rounded-full px-5 py-3 text-center text-sm font-semibold transition active:scale-95 ${
                    p.destacado
                      ? "bg-marca text-crema hover:bg-marca-fuerte"
                      : "border border-marca text-marca hover:bg-marca hover:text-crema"
                  }`}
                >
                  {es ? "WhatsApp" : "WhatsApp"}
                </a>
                <a
                  href={mailHref(p.nombre)}
                  className="rounded-full border border-linea px-5 py-2.5 text-center text-sm font-semibold text-carbon/70 transition hover:bg-carbon/5"
                >
                  {es ? "Escribir por mail" : "Email us"}
                </a>
              </div>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-lg text-center text-sm text-carbon/55">
          {es
            ? "Te respondemos, coordinamos la transferencia y activamos el local. Sin Mercado Pago en el medio."
            : "We reply, arrange a bank transfer and activate your venue. No Mercado Pago in between."}
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

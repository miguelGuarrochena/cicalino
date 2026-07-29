"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Controls } from "@/components/ui/Controls";
import { useApp } from "@/components/providers/Providers";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { TurnstileField } from "@/components/probar/TurnstileField";
import { crearSolicitud } from "@/lib/actions/leads";
import { isCuil, isEmail, formatCuil, isWhatsapp } from "@/lib/validations";
import { PRECIO_POR_SUCURSAL } from "@/lib/precios";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const PRECIO_MENSUAL = PRECIO_POR_SUCURSAL;
const PRECIO_ANUAL = PRECIO_MENSUAL * 10;

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-sm text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 placeholder:text-carbon/40";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const PreciosPage = () => {
  const { locale } = useApp();
  const es = locale !== "en";
  const [anual, setAnual] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [local, setLocal] = useState("");
  const [direccion, setDireccion] = useState("");
  const [cuil, setCuil] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileStatus, setTurnstileStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [turnstileKey, setTurnstileKey] = useState(0);

  const necesitaTurnstile = Boolean(TURNSTILE_SITE_KEY);
  const plan = anual ? "anual" : "mensual";

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

  const recargarTurnstile = () => {
    setTurnstileToken(null);
    setTurnstileStatus("loading");
    setTurnstileKey((k) => k + 1);
    setError(null);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!nombre.trim() || !isEmail(email)) {
      setError(
        es
          ? "Completá tu nombre y un email válido."
          : "Enter your name and a valid email.",
      );
      return;
    }
    if (!local.trim()) {
      setError(
        es
          ? "Completá el nombre del local o empresa."
          : "Enter the business name.",
      );
      return;
    }
    if (!telefono.trim() || !isWhatsapp(telefono)) {
      setError(
        es
          ? "Completá un teléfono válido (mín. 8 dígitos)."
          : "Enter a valid phone (min. 8 digits).",
      );
      return;
    }
    if (!isCuil(cuil)) {
      setError(
        es
          ? "Completá un CUIL/CUIT válido (11 dígitos)."
          : "Enter a valid tax ID (11 digits).",
      );
      return;
    }
    if (necesitaTurnstile && !turnstileToken) {
      setError(
        turnstileStatus === "error"
          ? es
            ? "No se pudo cargar la verificación. Recargala."
            : "Verification failed. Reload it."
          : es
            ? "Esperá un segundo a que cargue la verificación."
            : "Wait for verification to load.",
      );
      return;
    }
    setLoading(true);
    const res = await crearSolicitud({
      nombre,
      email,
      telefono,
      local,
      direccion,
      cuil,
      tipo: "contrato",
      plan,
      turnstileToken: turnstileToken ?? undefined,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      recargarTurnstile();
      return;
    }
    setEnviado(true);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-crema">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo className="h-10 sm:h-12" />
        <Controls />
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-10 sm:py-14">
        {enviado ? (
          <div className="u-in text-center">
            <h1 className="font-display text-4xl uppercase tracking-tight text-marca">
              {es ? "Datos enviados" : "Details sent"}
            </h1>
            <p className="mx-auto mt-4 max-w-md text-carbon/60">
              {es
                ? `Recibimos tu pedido del plan ${anual ? "anual" : "mensual"}. A la brevedad te activamos la cuenta y te mandamos el link de condiciones y pago a `
                : `We got your ${anual ? "yearly" : "monthly"} plan request. We’ll activate soon and email payment details to `}
              <b className="text-carbon">{email}</b>.
            </p>
            <Link
              href="/"
              className="mt-8 inline-block rounded-full bg-marca px-6 py-3 text-sm font-semibold text-crema"
            >
              {es ? "Volver al inicio" : "Back home"}
            </Link>
          </div>
        ) : (
          <>
            <div className="u-in text-center">
              <h1 className="font-display text-4xl uppercase tracking-tight text-marca sm:text-5xl">
                {es ? "Empezá hoy" : "Start today"}
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
                    )} por cada una.`
                  : `Several branches? Add ${money.format(
                      anual ? PRECIO_ANUAL : PRECIO_MENSUAL,
                    )} per branch.`}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-carbon/45">
                {es
                  ? "El precio puede actualizarse por inflación; te avisamos antes del próximo ciclo. Al contratar aceptás las bases y condiciones."
                  : "Prices may change with notice. Contracting includes accepting our terms."}
              </p>

              {!formOpen ? (
                <div className="mt-6 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setFormOpen(true)}
                    className="rounded-full bg-marca px-5 py-3 text-center text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
                  >
                    {es
                      ? `Contratar plan ${anual ? "anual" : "mensual"}`
                      : `Get ${anual ? "yearly" : "monthly"} plan`}
                  </button>
                  <Link
                    href="/probar"
                    className="rounded-full border border-linea px-5 py-2.5 text-center text-sm font-semibold text-carbon/70 transition hover:bg-carbon/5"
                  >
                    {es ? "O probá 1 mes gratis" : "Or start a free month"}
                  </Link>
                </div>
              ) : (
                <form onSubmit={enviar} className="mt-6 flex flex-col gap-3">
                  <p className="text-xs font-semibold text-marca">
                    {es
                      ? `Plan elegido: ${anual ? "Anual" : "Mensual"} · ${money.format(
                          anual ? PRECIO_ANUAL : PRECIO_MENSUAL,
                        )}`
                      : `Selected: ${anual ? "Yearly" : "Monthly"} · ${money.format(
                          anual ? PRECIO_ANUAL : PRECIO_MENSUAL,
                        )}`}
                  </p>
                  <input
                    className={INPUT}
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    placeholder={
                      es ? "Nombre del local / empresa *" : "Business name *"
                    }
                  />
                  <input
                    className={INPUT}
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder={es ? "Responsable *" : "Contact person *"}
                    autoComplete="name"
                  />
                  <input
                    className={INPUT}
                    type="tel"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder={
                      es ? "Teléfono / WhatsApp *" : "Phone / WhatsApp *"
                    }
                    autoComplete="tel"
                  />
                  <input
                    className={INPUT}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={es ? "Email *" : "Email *"}
                    autoComplete="email"
                  />
                  <input
                    className={INPUT}
                    inputMode="numeric"
                    value={cuil}
                    onChange={(e) => setCuil(formatCuil(e.target.value))}
                    placeholder={es ? "CUIL / CUIT *" : "Tax ID *"}
                    autoComplete="off"
                  />
                  <input
                    className={INPUT}
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    placeholder={es ? "Dirección" : "Address"}
                    autoComplete="street-address"
                  />
                  {TURNSTILE_SITE_KEY && (
                    <div className="space-y-2">
                      <TurnstileField
                        key={turnstileKey}
                        siteKey={TURNSTILE_SITE_KEY}
                        onToken={setTurnstileToken}
                        onStatus={setTurnstileStatus}
                      />
                      {turnstileStatus === "error" && (
                        <button
                          type="button"
                          onClick={recargarTurnstile}
                          className="mx-auto block text-xs font-semibold text-marca underline"
                        >
                          {es ? "Recargar verificación" : "Reload verification"}
                        </button>
                      )}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={
                      loading ||
                      (necesitaTurnstile && !turnstileToken)
                    }
                    className="rounded-full bg-marca px-5 py-3 text-sm font-semibold text-crema disabled:opacity-60"
                  >
                    {loading
                      ? es
                        ? "Enviando…"
                        : "Sending…"
                      : es
                        ? "Enviar y contratar"
                        : "Submit"}
                  </button>
                  {error && (
                    <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-600">
                      {error}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="text-center text-xs text-carbon/45 hover:underline"
                  >
                    {es ? "Cancelar" : "Cancel"}
                  </button>
                </form>
              )}
            </div>

            <p className="mx-auto mt-8 max-w-lg text-center text-sm text-carbon/55">
              {es
                ? "Te activamos, mandamos condiciones + alias de pago, y listo."
                : "We activate, send terms + payment alias, and you’re set."}
            </p>

            <p className="mt-8 text-center text-xs text-carbon/50">
              <Link href="/" className="hover:underline">
                ← {es ? "Volver al inicio" : "Back home"}
              </Link>
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default PreciosPage;

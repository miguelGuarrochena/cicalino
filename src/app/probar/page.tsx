"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Controls } from "@/components/ui/Controls";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { ThemedImg } from "@/components/ui/ThemedImg";
import { crearSolicitud } from "@/lib/actions/leads";
import { isEmail } from "@/lib/validations";

const INPUT =
  "w-full rounded-xl border border-linea bg-surface px-4 py-3 text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 placeholder:text-carbon/40";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const ProbarPage = () => {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [local, setLocal] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Carga el script de Turnstile una sola vez (solo si hay site key).
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    if (document.querySelector("script[data-turnstile]")) return;
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    s.setAttribute("data-turnstile", "1");
    document.head.appendChild(s);
  }, []);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!nombre.trim() || !isEmail(email)) {
      setError("Completá tu nombre y un email válido.");
      return;
    }
    // Token del widget (si Turnstile está activo).
    const turnstileToken = formRef.current
      ?.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')
      ?.value;
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Esperá un segundo a que cargue la verificación y reintentá.");
      return;
    }
    setLoading(true);
    const res = await crearSolicitud({
      nombre,
      email,
      local,
      ciudad,
      turnstileToken,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
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

      <main className="mx-auto w-full max-w-md flex-1 px-5 py-10 sm:py-14">
        {enviado ? (
          <div className="u-in flex flex-col items-center gap-5 text-center">
            <ThemedImg name="ok" alt="" className="h-36" />
            <h1 className="font-display text-3xl uppercase tracking-tight text-marca">
              ¡Recibimos tu pedido!
            </h1>
            <p className="max-w-sm text-carbon/60">
              Te escribimos a <b>{email}</b> para activarte la prueba de 1 mes
              gratis, normalmente en el día. 🎉
            </p>
            <Link
              href="/"
              className="rounded-full bg-marca px-6 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
            >
              Volver al inicio
            </Link>
          </div>
        ) : (
          <>
            <div className="u-in text-center">
              <h1 className="font-display text-4xl uppercase tracking-tight text-marca sm:text-5xl">
                Probá gratis
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-carbon/60">
                Dejanos tus datos y te activamos 1 mes gratis. Tu cliente nunca
                paga.
              </p>
            </div>

            <form
              ref={formRef}
              onSubmit={enviar}
              className="u-in mt-8 flex flex-col gap-3 rounded-[24px] border border-linea bg-surface p-5 shadow-sm"
              style={{ animationDelay: "0.05s" }}
            >
              <input
                className={INPUT}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre *"
                autoComplete="name"
              />
              <input
                className={INPUT}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Tu email *"
                autoComplete="email"
              />
              <input
                className={INPUT}
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Nombre del local"
              />
              <input
                className={INPUT}
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
                placeholder="Ciudad"
              />
              {TURNSTILE_SITE_KEY && (
                <div
                  className="cf-turnstile mx-auto"
                  data-sitekey={TURNSTILE_SITE_KEY}
                  data-action="turnstile-spin-v2"
                />
              )}
              <button
                type="submit"
                disabled={loading}
                className="mt-1 rounded-full bg-marca px-5 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95 disabled:opacity-60"
              >
                {loading ? "Enviando…" : "Quiero probar gratis"}
              </button>
              {error && (
                <p className="text-center text-xs text-red-500">{error}</p>
              )}
            </form>

            <p className="mt-6 text-center text-xs text-carbon/40">
              <Link href="/" className="hover:underline">
                ← Volver
              </Link>
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};
export default ProbarPage;

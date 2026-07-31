"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Controls } from "@/components/ui/Controls";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { ThemedImg } from "@/components/ui/ThemedImg";
import { TurnstileField } from "@/components/probar/TurnstileField";
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
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileStatus, setTurnstileStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [turnstileKey, setTurnstileKey] = useState(0);

  const necesitaTurnstile = Boolean(TURNSTILE_SITE_KEY);

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
      setError("Completá tu nombre y un email válido.");
      return;
    }
    if (necesitaTurnstile && !turnstileToken) {
      setError(
        turnstileStatus === "error"
          ? "No se pudo cargar la verificación. Recargala e intentá de nuevo."
          : "Esperá un segundo a que cargue la verificación y reintentá.",
      );
      return;
    }
    setLoading(true);
    try {
      const res = await crearSolicitud({
        nombre,
        email,
        local,
        ciudad,
        tipo: "prueba",
        turnstileToken: turnstileToken ?? undefined,
      });
      if (!res.ok) {
        setError(res.error);
        recargarTurnstile();
        return;
      }
      setEnviado(true);
    } catch (err) {
      console.error("probar", err);
      setError("Algo falló al enviar. Reintentá en un momento.");
      recargarTurnstile();
    } finally {
      setLoading(false);
    }
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
                paga. Una prueba por mail; si querés otro local, escribinos.
              </p>
            </div>

            <form
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
                <div className="space-y-2">
                  <TurnstileField
                    key={turnstileKey}
                    siteKey={TURNSTILE_SITE_KEY}
                    action="probar"
                    onToken={setTurnstileToken}
                    onStatus={setTurnstileStatus}
                  />
                  {turnstileStatus === "error" && (
                    <button
                      type="button"
                      onClick={recargarTurnstile}
                      className="mx-auto block text-xs font-semibold text-marca underline"
                    >
                      Recargar verificación
                    </button>
                  )}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="mt-1 rounded-full bg-marca px-5 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95 disabled:opacity-60"
              >
                {loading
                  ? "Enviando…"
                  : necesitaTurnstile && turnstileStatus === "loading" && !turnstileToken
                    ? "Cargando verificación…"
                    : "Quiero probar gratis"}
              </button>
              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-600"
                >
                  {error}
                </p>
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

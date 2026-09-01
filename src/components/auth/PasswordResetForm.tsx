"use client";

import { useState } from "react";
import Link from "next/link";
import { Controls } from "@/components/ui/Controls";
import { Logo } from "@/components/ui/Logo";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { useApp } from "@/components/providers/Providers";
import { isEmail } from "@/lib/validations";
import { requestPasswordReset, resetPassword } from "@/lib/actions/password";
import { PASSWORD_MIN, type ResetReason } from "@/lib/auth/password";

const INPUT =
  "w-full rounded-xl border border-linea bg-surface px-4 py-3 text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 placeholder:text-carbon/40";

/* Los motivos vienen del servidor; las frases salen del diccionario. */
const CLAVE_ERROR: Record<ResetReason, string> = {
  invalido: "recuperar.errInvalido",
  expirado: "recuperar.errExpirado",
  corta: "recuperar.errCorta",
  "rate-limited": "recuperar.errIntentos",
  "no-configurado": "recuperar.errServidor",
  error: "recuperar.errServidor",
};

/* Mismo ojo que usa /login, para no tener dos formularios de contraseña que
   se ven distinto. */
const OjoIcon = ({ tachado }: { tachado: boolean }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {tachado ? (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    ) : (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

const Marco = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-dvh flex-col">
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-5 py-16">
      <Controls className="absolute right-4 top-4 sm:right-6 sm:top-6" />
      <div className="u-in w-full max-w-md" style={{ animationDelay: "0.05s" }}>
        <div className="mb-8 flex justify-center">
          <Logo className="h-12" />
        </div>
        {children}
      </div>
    </main>
    <SiteFooter />
  </div>
);

const VolverAEntrar = () => {
  const { t } = useApp();
  return (
    <p className="mt-8 text-center text-xs text-carbon/40">
      <Link href="/login" className="underline-offset-2 hover:underline">
        {t("recuperar.volver")}
      </Link>
    </p>
  );
};

/* Paso 1: pedir el mail con el link. */
const PedirLink = () => {
  const { t } = useApp();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!isEmail(email)) {
      setError(t("recuperar.errEmail"));
      return;
    }
    setError(null);
    setLoading(true);
    const r = await requestPasswordReset(email);
    setLoading(false);
    if (!r.ok) {
      setError(t(CLAVE_ERROR[r.reason], { n: PASSWORD_MIN }));
      return;
    }
    setEnviado(true);
  };

  if (enviado) {
    return (
      <Marco>
        <h1 className="text-center font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
          {t("recuperar.listoTitulo")}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-sm text-carbon/60">
          {t("recuperar.listoSub")}
        </p>
        <VolverAEntrar />
      </Marco>
    );
  }

  return (
    <Marco>
      <h1 className="text-center font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
        {t("recuperar.titulo")}
      </h1>
      <p className="mt-2 text-center text-sm text-carbon/55">
        {t("recuperar.sub")}
      </p>

      <form
        onSubmit={enviar}
        className="mt-8 flex flex-col gap-3 rounded-[24px] border border-linea bg-surface p-5 shadow-sm"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-carbon/70">
            {t("recuperar.email")}
          </span>
          <input
            type="email"
            autoComplete="username"
            className={`${INPUT} ${error ? "border-red-400" : ""}`}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="tu@email.com"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="mt-1 flex min-h-12 w-full items-center justify-center rounded-full bg-marca px-5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? t("recuperar.enviando") : t("recuperar.cta")}
        </button>
        {error && (
          <p className="text-center text-xs text-red-500">{error}</p>
        )}
      </form>

      <VolverAEntrar />
    </Marco>
  );
};

/* Paso 2: llegó por el link del mail y elige la contraseña nueva. */
const ElegirNueva = ({ token }: { token: string }) => {
  const { t } = useApp();
  const [pass, setPass] = useState("");
  const [repetir, setRepetir] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Un token vencido no se arregla reintentando: se cambia el formulario por
   * el pedido de otro link. */
  const [linkMuerto, setLinkMuerto] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (pass.length < PASSWORD_MIN) {
      setError(t("recuperar.errCorta", { n: PASSWORD_MIN }));
      return;
    }
    if (pass !== repetir) {
      setError(t("recuperar.errDistintas"));
      return;
    }
    setError(null);
    setLoading(true);
    const r = await resetPassword(token, pass);
    setLoading(false);
    if (!r.ok) {
      setError(t(CLAVE_ERROR[r.reason], { n: PASSWORD_MIN }));
      if (r.reason === "expirado" || r.reason === "invalido") {
        setLinkMuerto(true);
      }
      return;
    }
    setListo(true);
  };

  if (listo) {
    return (
      <Marco>
        <h1 className="text-center font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
          {t("recuperar.okTitulo")}
        </h1>
        <p className="mt-3 text-center text-sm text-carbon/60">
          {t("recuperar.okSub")}
        </p>
        <Link
          href="/login"
          className="mt-8 flex min-h-12 w-full items-center justify-center rounded-full bg-marca px-5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
        >
          {t("recuperar.volver")}
        </Link>
      </Marco>
    );
  }

  if (linkMuerto) {
    return (
      <Marco>
        <h1 className="text-center font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
          {t("recuperar.titulo")}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-sm text-carbon/60">
          {error}
        </p>
        <Link
          href="/recuperar"
          className="mt-8 flex min-h-12 w-full items-center justify-center rounded-full bg-marca px-5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
        >
          {t("recuperar.pedirOtro")}
        </Link>
        <VolverAEntrar />
      </Marco>
    );
  }

  return (
    <Marco>
      <h1 className="text-center font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
        {t("recuperar.nuevaTitulo")}
      </h1>
      <p className="mt-2 text-center text-sm text-carbon/55">
        {t("recuperar.nuevaSub")}
      </p>

      <form
        onSubmit={guardar}
        className="mt-8 flex flex-col gap-3 rounded-[24px] border border-linea bg-surface p-5 shadow-sm"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-carbon/70">
            {t("recuperar.nueva")}
          </span>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              autoComplete="new-password"
              className={`${INPUT} pr-12 ${error ? "border-red-400" : ""}`}
              value={pass}
              onChange={(e) => {
                setPass(e.target.value);
                setError(null);
              }}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-carbon/45 transition hover:bg-carbon/5 hover:text-carbon/70"
              aria-label={t(
                showPass ? "recuperar.ocultar" : "recuperar.mostrar",
              )}
              aria-pressed={showPass}
            >
              <OjoIcon tachado={showPass} />
            </button>
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-carbon/70">
            {t("recuperar.repetir")}
          </span>
          <input
            type={showPass ? "text" : "password"}
            autoComplete="new-password"
            className={`${INPUT} ${error ? "border-red-400" : ""}`}
            value={repetir}
            onChange={(e) => {
              setRepetir(e.target.value);
              setError(null);
            }}
            placeholder="••••••••"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="mt-1 flex min-h-12 w-full items-center justify-center rounded-full bg-marca px-5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? t("recuperar.guardando") : t("recuperar.guardar")}
        </button>
        {error && <p className="text-center text-xs text-red-500">{error}</p>}
      </form>

      <VolverAEntrar />
    </Marco>
  );
};

export const PasswordResetForm = ({ token }: { token: string | null }) =>
  token ? <ElegirNueva token={token} /> : <PedirLink />;

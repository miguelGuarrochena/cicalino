"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Controls } from "@/components/ui/Controls";
import { Logo } from "@/components/ui/Logo";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore, type CurrentRole } from "@/lib/store/session-store";
import { isEmail } from "@/lib/validations";
import { signIn } from "@/lib/auth/actions";

const INPUT =
  "w-full rounded-xl border border-linea bg-surface px-4 py-3 text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 placeholder:text-carbon/40";

const EntrarPage = () => {
  const { t } = useApp();
  const router = useRouter();
  const setRole = useSessionStore((s) => s.setRol);
  const setContexto = useSessionStore((s) => s.setContexto);

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ email?: string; pass?: string }>({});

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: { email?: string; pass?: string } = {};
    if (!isEmail(email)) next.email = t("entrar.errEmail");
    if (pass.trim().length < 4) next.pass = t("entrar.errPass");
    setErrors(next);
    if (Object.keys(next).length) return;
    setServerError(null);

    setLoading(true);
    const res = await signIn(email, pass);
    setLoading(false);
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    setRole(res.rol as CurrentRole);
    if (res.rol === "superadmin") {
      setContexto(null, null);
      router.push("/admin");
    } else {
      setContexto(res.organizationId, res.localId);
      router.push("/panel");
    }
    router.refresh();
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-5 py-16">
        <Controls className="absolute right-4 top-4 sm:right-6 sm:top-6" />

        <div className="u-in w-full max-w-md" style={{ animationDelay: "0.05s" }}>
          <div className="mb-8 flex justify-center">
            <Logo className="h-12" />
          </div>

          <h1 className="text-center font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
            {t("entrar.titulo")}
          </h1>
          <p className="mt-2 text-center text-sm text-carbon/55">
            {t("entrar.sub")}
          </p>

          <form
            onSubmit={submitLogin}
            className="mt-8 flex flex-col gap-3 rounded-[24px] border border-linea bg-surface p-5 shadow-sm"
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-carbon/70">
                {t("entrar.email")}
              </span>
              <input
                type="email"
                className={`${INPUT} ${errors.email ? "border-red-400" : ""}`}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((er) => ({ ...er, email: undefined }));
                }}
                placeholder="tu@email.com"
                autoComplete="username"
              />
              {errors.email && (
                <span className="text-xs text-red-500">{errors.email}</span>
              )}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-carbon/70">
                {t("entrar.pass")}
              </span>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  className={`${INPUT} pr-12 ${errors.pass ? "border-red-400" : ""}`}
                  value={pass}
                  onChange={(e) => {
                    setPass(e.target.value);
                    setErrors((er) => ({ ...er, pass: undefined }));
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-carbon/45 transition hover:bg-carbon/5 hover:text-carbon/70"
                  aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={showPass}
                >
                  {showPass ? (
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
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
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
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.pass && (
                <span className="text-xs text-red-500">{errors.pass}</span>
              )}
            </label>
            <button
              type="submit"
              disabled={loading}
              className="mt-1 rounded-full bg-marca px-5 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Entrando…" : t("entrar.cta")}
            </button>
            {serverError && (
              <p className="text-center text-xs text-red-500">{serverError}</p>
            )}
          </form>

          <p className="mt-8 text-center text-xs text-carbon/40">
            <Link href="/" className="underline-offset-2 hover:underline">
              {t("entrar.volver")}
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};
export default EntrarPage;

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Controls } from "@/components/ui/Controls";
import { Logo } from "@/components/ui/Logo";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore, type RolActual } from "@/lib/store/session-store";
import { isEmail } from "@/lib/validations";

type Destino = {
  rol: RolActual;
  href: string;
  tituloKey: string;
  detKey: string;
  badge?: string;
};

const DESTINOS: Destino[] = [
  {
    rol: "superadmin",
    href: "/admin",
    tituloKey: "entrar.super",
    detKey: "entrar.superDet",
    badge: "Cicalino",
  },
  {
    rol: "admin",
    href: "/panel",
    tituloKey: "entrar.admin",
    detKey: "entrar.adminDet",
  },
  {
    rol: "supervisor",
    href: "/panel",
    tituloKey: "entrar.supervisor",
    detKey: "entrar.supervisorDet",
  },
  {
    rol: "empleado",
    href: "/panel",
    tituloKey: "entrar.empleado",
    detKey: "entrar.empleadoDet",
  },
];

const INPUT =
  "w-full rounded-xl border border-linea bg-surface px-4 py-3 text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 placeholder:text-carbon/40";

// Pantalla de entrada (front-only). En prod: email + pass reales.
// Mientras: se puede probar cada rol por separado.
const EntrarPage = () => {
  const { t } = useApp();
  const router = useRouter();
  const setRol = useSessionStore((s) => s.setRol);
  const setContexto = useSessionStore((s) => s.setContexto);

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [aviso, setAviso] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; pass?: string }>({});

  const entrarComo = (d: Destino) => {
    setRol(d.rol);
    if (d.rol === "superadmin") {
      setContexto(null, null);
    } else {
      // Demo: La Esquina · Centro
      setContexto("org-esquina", "suc-centro");
    }
    router.push(d.href);
  };

  const submitLogin = (e: React.FormEvent) => {
        e.preventDefault();
        const next: { email?: string; pass?: string } = {};
        if (!isEmail(email)) next.email = t("entrar.errEmail");
        if (pass.trim().length < 4) next.pass = t("entrar.errPass");
        setErrors(next);
        if (Object.keys(next).length) return;

        setAviso(true);
        if (email.toLowerCase().includes("super")) {
          setRol("superadmin");
          setContexto(null, null);
          router.push("/admin");
          return;
        }
        setRol("admin");
        setContexto("org-esquina", "suc-centro");
        router.push("/panel");
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
              placeholder="dueño@cafedemo.com"
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
            <input
              type="password"
              className={`${INPUT} ${errors.pass ? "border-red-400" : ""}`}
              value={pass}
              onChange={(e) => {
                setPass(e.target.value);
                setErrors((er) => ({ ...er, pass: undefined }));
              }}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            {errors.pass && (
              <span className="text-xs text-red-500">{errors.pass}</span>
            )}
          </label>
          <button
            type="submit"
            className="mt-1 rounded-full bg-marca px-5 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
          >
            {t("entrar.cta")}
          </button>
          {aviso && (
            <p className="text-center text-xs text-carbon/45">
              {t("entrar.demoHint")}
            </p>
          )}
        </form>

        <div className="mt-8">
          <p className="mb-3 text-center text-xs font-bold uppercase tracking-wide text-carbon/40">
            {t("entrar.probar")}
          </p>
          <div className="flex flex-col gap-2">
            {DESTINOS.map((d, i) => (
              <button
                key={d.rol}
                onClick={() => entrarComo(d)}
                className="u-in group flex items-start gap-3 rounded-2xl border border-linea bg-surface p-4 text-left shadow-sm transition hover:border-marca/40 hover:bg-marca/5"
                style={{ animationDelay: `${0.12 + i * 0.05}s` }}
              >
                <span
                  className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    d.rol === "superadmin"
                      ? "bg-carbon text-crema"
                      : "bg-marca/15 text-marca"
                  }`}
                >
                  {d.rol === "superadmin"
                    ? "SA"
                    : d.rol === "admin"
                      ? "D"
                      : d.rol === "supervisor"
                        ? "S"
                        : "E"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-carbon">
                      {t(d.tituloKey)}
                    </span>
                    {d.badge && (
                      <span className="rounded-full bg-carbon/8 px-2 py-0.5 text-[10px] font-bold uppercase text-carbon/55">
                        {d.badge}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-carbon/55">
                    {t(d.detKey)}
                  </span>
                </span>
                <span className="mt-1 text-carbon/30 transition group-hover:text-marca">
                  →
                </span>
              </button>
            ))}
          </div>
        </div>

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

"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore, type RolActual } from "@/lib/store/session-store";

const ROLES_LOCAL: RolActual[] = ["admin", "supervisor", "empleado"];

// Selector de rol del LOCAL para previsualizar cada vista en el prototipo.
// Superadmin vive aparte en /admin y se entra desde /entrar.
// En produccion el rol viene del login y esto no existe.
export const RoleSwitcher = () => {
  const { locale, t } = useApp();
  const { rol, setRol, impersonando, salirImpersonacion } = useSessionStore();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const enAdmin = path.startsWith("/admin");

  const label = (r: RolActual) => {
    if (r === "superadmin") return "Superadmin";
    if (r === "admin") return locale === "en" ? "Owner" : "Dueño";
    if (r === "supervisor") return "Supervisor";
    return locale === "en" ? "Staff" : "Empleado";
  };

  // En /admin solo se muestra un chip + link a cambiar cuenta.
  if (enAdmin) {
    return (
      <Link
        href="/entrar"
        className="flex items-center gap-1.5 rounded-full border border-dashed border-marca/40 px-3 py-1.5 text-xs font-semibold text-marca transition hover:bg-marca/5"
        title="Cambiar cuenta (demo)"
      >
        Superadmin
        <span className="text-marca/50">·</span>
        <span className="hidden sm:inline">{locale === "en" ? "Switch" : "Cambiar"}</span>
      </Link>
    );
  }

  // Superadmin dentro de un local: chip fijo + volver.
  if (impersonando) {
    return (
      <button
        onClick={() => {
          salirImpersonacion();
          router.push("/admin");
        }}
        className="flex items-center gap-1.5 rounded-full border border-carbon/30 bg-carbon px-3 py-1.5 text-xs font-semibold text-crema transition hover:opacity-90"
        title={t("super.volverAdmin")}
      >
        <span className="hidden max-w-[9rem] truncate sm:inline">
          {impersonando.sucursalNombre}
        </span>
        <span className="sm:hidden">SA</span>
        <span className="opacity-50">·</span>
        <span>{locale === "en" ? "Exit" : "Salir"}</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-dashed border-marca/40 px-3 py-1.5 text-xs font-semibold text-marca transition hover:bg-marca/5"
        title="Vista de rol (demo)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-1a6 6 0 0 1 12 0v1" />
        </svg>
        <span className="hidden sm:inline">{label(rol)}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-52 rounded-2xl border border-linea bg-surface p-1.5 shadow-xl">
            <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-carbon/40">
              {locale === "en" ? "Local roles · demo" : "Roles del local · demo"}
            </p>
            {ROLES_LOCAL.map((r) => (
              <button
                key={r}
                onClick={() => {
                  setRol(r);
                  setOpen(false);
                  if (r === "empleado" && path.startsWith("/panel/")) {
                    router.push("/panel");
                  }
                }}
                className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm transition hover:bg-carbon/5 ${
                  rol === r ? "font-semibold text-marca" : "text-carbon"
                }`}
              >
                {label(r)}
                {rol === r && <span>✓</span>}
              </button>
            ))}
            <div className="my-1 border-t border-linea" />
            <Link
              href="/entrar"
              onClick={() => setOpen(false)}
              className="flex w-full items-center rounded-xl px-2.5 py-2 text-left text-sm text-carbon/60 transition hover:bg-carbon/5 hover:text-carbon"
            >
              {locale === "en" ? "All accounts…" : "Todas las cuentas…"}
            </Link>
          </div>
        </>
      )}
    </div>
  );
};

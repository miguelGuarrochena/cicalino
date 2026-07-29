"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore } from "@/lib/store/session-store";
import { verificarPasswordDueño } from "@/lib/auth/actions";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { NoAccess } from "@/components/ui/NoAccess";

/**
 * Protege Config / Métricas: pide la contraseña de la cuenta del dueño
 * (no el PIN de 4 dígitos del fichaje). El layout vuelve a bloquear al
 * salir de estas secciones.
 */
export const AdminGate = ({ children }: { children: React.ReactNode }) => {
  const { locale } = useApp();
  const role = useSessionStore((s) => s.rol);
  const unlocked = useSessionStore((s) => s.adminDesbloqueado);
  const unlock = useSessionStore((s) => s.desbloquearAdmin);

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPass, setShowPass] = useState(false);

  if (role === "empleado" || role === "superadmin") {
    return <NoAccess />;
  }

  if (unlocked) return <>{children}</>;

  const es = locale !== "en";

  const confirmar = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (!supabaseConfigurado) {
        // Demo local: sin backend de auth; pedimos algo no trivial.
        if (password.trim().length < 6) {
          setError(
            es
              ? "Ingresá la contraseña de tu cuenta (mín. 6)."
              : "Enter your account password (min. 6).",
          );
          return;
        }
        unlock();
        setPassword("");
        return;
      }
      const res = await verificarPasswordDueño(password);
      if (!res.ok) {
        setError(res.error);
        setPassword("");
        return;
      }
      unlock();
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-[28px] border border-linea bg-surface px-6 py-12 text-center shadow-sm">
      <span className="flex size-12 items-center justify-center rounded-full bg-marca/10 text-marca">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </span>
      <div>
        <h1 className="font-display text-2xl uppercase tracking-tight text-carbon">
          {es ? "Solo el dueño" : "Owner only"}
        </h1>
        <p className="mt-2 text-sm text-carbon/55">
          {es
            ? "Esta sección pide la contraseña de tu cuenta (la del email), no el PIN de fichaje."
            : "This section needs your account password (email login), not the clock-in PIN."}
        </p>
      </div>
      <div className="w-full text-left">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-carbon/70">
            {es ? "Contraseña" : "Password"}
          </span>
          <div className="relative">
            <input
              autoFocus
              type={showPass ? "text" : "password"}
              autoComplete="current-password"
              disabled={busy}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmar();
              }}
              className="w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 pr-12 text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 disabled:opacity-60"
              placeholder="••••••••"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-carbon/50 hover:text-carbon"
            >
              {showPass ? (es ? "Ocultar" : "Hide") : es ? "Ver" : "Show"}
            </button>
          </div>
        </label>
        {error && (
          <p className="mt-2 text-center text-xs text-red-500">{error}</p>
        )}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void confirmar()}
        className="w-full rounded-full bg-marca px-5 py-3.5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte disabled:opacity-60"
      >
        {busy ? "…" : es ? "Desbloquear" : "Unlock"}
      </button>
      <p className="text-xs text-carbon/45">
        {es
          ? "Al salir de acá se vuelve a bloquear solo."
          : "Leaving this page locks it again."}
      </p>
    </div>
  );
};

"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore } from "@/lib/store/session-store";
import { verifyPasswordDueño } from "@/lib/auth/actions";
import { supabaseConfigured } from "@/lib/supabase/config";
import { NoAccess } from "@/components/ui/NoAccess";

export const AdminGate = ({ children }: { children: React.ReactNode }) => {
  const { locale } = useApp();
  const role = useSessionStore((s) => s.rol);
  const unlocked = useSessionStore((s) => s.adminDesbloqueado);
  const unlockedUntil = useSessionStore((s) => s.adminDesbloqueadoHasta);
  const unlock = useSessionStore((s) => s.desbloquearAdmin);
  const impersonando = useSessionStore((s) => s.impersonando);

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPass, setShowPass] = useState(false);

  /* Sí, lee el reloj durante el render, y no hay forma pura de hacerlo: la
   * pregunta es "¿venció el desbloqueo?" y la respuesta cambia con el tiempo
   * sin que cambie ningún estado. Moverlo a un efecto solo lo cambia por el
   * problema de al lado (setState en el efecto) y agrega un render en el que
   * el panel se ve desbloqueado antes de saberlo.
   *
   * Vale la pena recordar que esta pantalla es una barrera de UI: el acceso
   * real a los datos lo decide RLS, no esto. */
  const vigente =
    /* eslint-disable-next-line react-hooks/purity -- ver arriba. */
    unlocked || (unlockedUntil != null && unlockedUntil > Date.now());

  useEffect(() => {
    if (vigente) unlock();
  }, [vigente, unlock]);

  if (role === "empleado" || role === "superadmin") {
    return <NoAccess />;
  }

  if (vigente) return <>{children}</>;

  const es = locale !== "en";

  const confirmar = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (!supabaseConfigured) {
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
      const res = await verifyPasswordDueño(password);
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
          {impersonando
            ? es
              ? "Ingresá la contraseña de tu cuenta de Cicalino, no la del dueño."
              : "Enter your own Cicalino password, not the owner's."
            : es
              ? "Ingresá la contraseña de tu cuenta (no el PIN)."
              : "Enter your account password (not the PIN)."}
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
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-carbon/45 transition hover:bg-carbon/5 hover:text-carbon/70"
              aria-label={
                showPass
                  ? es
                    ? "Ocultar contraseña"
                    : "Hide password"
                  : es
                    ? "Mostrar contraseña"
                    : "Show password"
              }
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

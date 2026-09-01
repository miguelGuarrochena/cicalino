"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useActiveEmployee } from "@/lib/hooks/useActiveEmployee";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { Pagination, slicePage } from "@/components/ui/Pagination";
import { verifyEmployeePinAction } from "@/lib/actions/pin";
import { supabaseConfigured } from "@/lib/supabase/config";

const inicial = (name: string) => {
  return (name.trim()[0] || "?").toUpperCase();
};

const PAGE_SIZE = 8;

export const Fichaje = () => {
  const { t } = useApp();
  const employees = useConfigStore((s) => s.employees);
  /* El vigente, no el guardado: un fichaje de ayer ya no cuenta y el botón
   * tiene que volver a decir "Fichar". */
  const activeEmployee = useActiveEmployee();
  const fichar = useSessionStore((s) => s.fichar);
  const leave = useSessionStore((s) => s.salir);

  const [open, setOpen] = useState(false);
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [page, setPage] = useState(1);

  const withName = employees.filter((e) => e.name.trim());
  const pageItems = slicePage(withName, page, PAGE_SIZE);

  const elegir = (id: string) => {
    const emp = employees.find((e) => e.id === id);
    if (!emp) return;
    if (emp.tienePin) {
      setPendiente(id);
      setPin("");
      setError(false);
    } else {
      void confirmar(id);
    }
  };

  const confirmar = async (id: string, pinIngresado?: string) => {
    const emp = employees.find((e) => e.id === id);
    if (!emp) return;

    if (!emp.tienePin) {
      fichar({ id: emp.id, name: emp.name });
      cerrar();
      return;
    }

    if (!supabaseConfigured) {
      fichar({ id: emp.id, name: emp.name });
      cerrar();
      return;
    }

    setVerificando(true);
    const ok = await verifyEmployeePinAction(id, (pinIngresado ?? "").trim());
    setVerificando(false);
    if (!ok) {
      setError(true);
      setPin("");
      return;
    }
    fichar({ id: ok.id, name: ok.name });
    cerrar();
  };

  const cerrar = () => {
    setOpen(false);
    setPendiente(null);
    setPin("");
    setError(false);
    setPage(1);
  };

  const pendingName =
    employees.find((e) => e.id === pendiente)?.name || "";

  return (
    <>
      <button
        type="button"
        onClick={() => (open ? cerrar() : setOpen(true))}
        className="flex items-center gap-1.5 rounded-full border border-linea bg-surface/70 px-2.5 py-1.5 text-sm font-semibold text-carbon backdrop-blur transition hover:bg-carbon/5 sm:gap-2 sm:px-3"
      >
        {activeEmployee ? (
          <>
            <span className="flex size-6 items-center justify-center rounded-full bg-marca text-xs text-crema">
              {inicial(activeEmployee.name)}
            </span>
            <span className="max-w-[6rem] truncate">
              {activeEmployee.name}
            </span>
          </>
        ) : (
          <>
            <span className="flex size-6 items-center justify-center rounded-full bg-carbon/10 text-xs text-carbon/50">
              +
            </span>
            <span>{t("fichaje.fichar")}</span>
          </>
        )}
      </button>

      {open && (
        <ModalShell
          onClose={cerrar}
          labelledBy="fichaje-title"
          busy={verificando}
        >
          {withName.length === 0 ? (
            <div>
              <div className="mb-3 flex items-start justify-between gap-3">
                <h3
                  id="fichaje-title"
                  className="font-display text-2xl uppercase tracking-tight text-carbon"
                >
                  {t("fichaje.elegi")}
                </h3>
                <ModalCloseBtn onClick={cerrar} label={t("qr.cerrar")} />
              </div>
              <p className="py-6 text-center text-sm text-carbon/50">
                {t("fichaje.sinEmpleados")}
              </p>
            </div>
          ) : pendiente ? (
            <div>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3
                    id="fichaje-title"
                    className="font-display text-2xl uppercase tracking-tight text-carbon"
                  >
                    {t("fichaje.pin")}
                  </h3>
                  <p className="mt-1 text-sm text-carbon/55">
                    {t("fichaje.ingresaPin", { n: pendingName })}
                  </p>
                </div>
                <ModalCloseBtn
                  onClick={cerrar}
                  disabled={verificando}
                  label={t("qr.cerrar")}
                />
              </div>
              <p className="text-xs text-carbon/45">{t("fichaje.pinExplica")}</p>
              <input
                autoFocus
                disabled={verificando}
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                  setError(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !verificando) {
                    void confirmar(pendiente, pin);
                  }
                }}
                placeholder="••••"
                className={`mt-4 w-full rounded-xl border px-4 py-3 text-center text-lg tracking-[0.45em] outline-none disabled:opacity-60 ${
                  error ? "border-red-400" : "border-linea"
                } bg-crema/40`}
              />
              {error && (
                <p className="mt-2 text-center text-xs text-red-500">
                  {t("fichaje.pinIncorrecto")}
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={verificando}
                  onClick={() => {
                    setPendiente(null);
                    setPin("");
                    setError(false);
                  }}
                  className="flex-1 rounded-full border border-linea px-4 py-3 text-sm font-semibold text-carbon disabled:opacity-50"
                >
                  {t("fichaje.atras")}
                </button>
                <button
                  type="button"
                  disabled={verificando}
                  onClick={() => void confirmar(pendiente, pin)}
                  className="flex-1 rounded-full bg-marca py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte disabled:opacity-60"
                >
                  {verificando ? "…" : t("fichaje.entrar")}
                </button>
              </div>
            </div>
          ) : activeEmployee ? (
            <div>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3
                    id="fichaje-title"
                    className="font-display text-2xl uppercase tracking-tight text-carbon"
                  >
                    {t("fichaje.cambiar")}
                  </h3>
                </div>
                <ModalCloseBtn onClick={cerrar} label={t("qr.cerrar")} />
              </div>
              <button
                type="button"
                onClick={() => leave()}
                className="flex w-full items-center gap-3 rounded-2xl border border-linea bg-crema/40 px-3 py-3 text-left transition hover:border-red-200 hover:bg-red-50/60"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-marca text-xs font-semibold text-crema">
                  {inicial(activeEmployee.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-carbon">
                    {activeEmployee.name}
                  </span>
                  <span className="block text-xs font-medium text-red-600">
                    {t("fichaje.cerrarSesion")}
                  </span>
                </span>
              </button>
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3
                    id="fichaje-title"
                    className="font-display text-2xl uppercase tracking-tight text-carbon"
                  >
                    {t("fichaje.elegi")}
                  </h3>
                  <p className="mt-1 text-xs text-carbon/45">
                    {t("fichaje.elegiSub")}
                  </p>
                </div>
                <ModalCloseBtn onClick={cerrar} label={t("qr.cerrar")} />
              </div>
              <ul className="flex flex-col gap-1.5">
                {pageItems.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => elegir(e.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-linea bg-crema/30 px-3 py-3 text-left transition hover:border-marca/40 hover:bg-marca/5"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-marca/15 text-xs font-semibold text-marca">
                        {inicial(e.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-carbon">
                          {e.name}
                        </span>
                        {e.rol && (
                          <span className="block truncate text-xs text-carbon/45">
                            {e.rol}
                          </span>
                        )}
                      </span>
                      <span className="text-carbon/30">→</span>
                    </button>
                  </li>
                ))}
              </ul>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={withName.length}
                onChange={setPage}
              />
            </div>
          )}
        </ModalShell>
      )}
    </>
  );
};

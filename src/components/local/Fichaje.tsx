"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { ModalShell } from "@/components/ui/ModalShell";
import { Paginacion, slicePage } from "@/components/ui/Paginacion";

const inicial = (nombre: string) => {
  return (nombre.trim()[0] || "?").toUpperCase();
};

const PAGE_SIZE = 8;

// Fichaje: elegís tu nombre y después tu PIN (único del local).
// Si ponés el PIN de otro, no entra: el PIN tiene que coincidir con esa persona.
export const Fichaje = () => {
  const { t } = useApp();
  const empleados = useConfigStore((s) => s.empleados);
  const { empleadoActivo, fichar, salir } = useSessionStore();

  const [open, setOpen] = useState(false);
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);

  const conNombre = empleados.filter((e) => e.nombre.trim());
  const pageItems = slicePage(conNombre, page, PAGE_SIZE);

  const elegir = (id: string) => {
        const emp = empleados.find((e) => e.id === id);
        if (!emp) return;
        if (emp.pin && emp.pin.trim()) {
          setPendiente(id);
          setPin("");
          setError(false);
        } else {
          confirmar(id);
        }
      };

  const confirmar = (id: string, pinIngresado?: string) => {
        const emp = empleados.find((e) => e.id === id);
        if (!emp) return;
        const esperado = (emp.pin ?? "").trim();
        const ingresado = (pinIngresado ?? "").trim();
        if (esperado && esperado !== ingresado) {
          setError(true);
          return;
        }
        fichar({ id: emp.id, nombre: emp.nombre });
        cerrar();
      };

  const cerrar = () => {
        setOpen(false);
        setPendiente(null);
        setPin("");
        setError(false);
        setPage(1);
      };

  const pendienteNombre =
    empleados.find((e) => e.id === pendiente)?.nombre || "";

  return (
    <>
      <button
        type="button"
        onClick={() => (open ? cerrar() : setOpen(true))}
        className="flex items-center gap-1.5 rounded-full border border-linea bg-surface/70 px-2.5 py-1.5 text-sm font-semibold text-carbon backdrop-blur transition hover:bg-carbon/5 sm:gap-2 sm:px-3"
      >
        {empleadoActivo ? (
          <>
            <span className="flex size-6 items-center justify-center rounded-full bg-marca text-xs text-crema">
              {inicial(empleadoActivo.nombre)}
            </span>
            <span className="max-w-[6rem] truncate">
              {empleadoActivo.nombre}
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
        <ModalShell onClose={cerrar} labelledBy="fichaje-title">
          {conNombre.length === 0 ? (
            <p className="py-6 text-center text-sm text-carbon/50">
              {t("fichaje.sinEmpleados")}
            </p>
          ) : pendiente ? (
            <div>
              <h3
                id="fichaje-title"
                className="font-display text-2xl uppercase tracking-tight text-carbon"
              >
                {t("fichaje.pin")}
              </h3>
              <p className="mt-1 text-sm text-carbon/55">
                {t("fichaje.ingresaPin", { n: pendienteNombre })}
              </p>
              <p className="mt-2 text-xs text-carbon/45">{t("fichaje.pinExplica")}</p>
              <input
                autoFocus
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                  setError(false);
                }}
                onKeyDown={(e) =>
                  e.key === "Enter" && confirmar(pendiente, pin)
                }
                placeholder="••••"
                className={`mt-4 w-full rounded-xl border px-4 py-3 text-center text-lg tracking-[0.45em] outline-none ${
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
                  onClick={() => {
                    setPendiente(null);
                    setPin("");
                    setError(false);
                  }}
                  className="flex-1 rounded-full border border-linea px-4 py-3 text-sm font-semibold text-carbon"
                >
                  {t("fichaje.atras")}
                </button>
                <button
                  type="button"
                  onClick={() => confirmar(pendiente, pin)}
                  className="flex-1 rounded-full bg-marca py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte"
                >
                  {t("fichaje.entrar")}
                </button>
              </div>
            </div>
          ) : (
            <div>
              {empleadoActivo && (
                <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-linea bg-crema/40 px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-marca text-xs font-semibold text-crema">
                      {inicial(empleadoActivo.nombre)}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs text-carbon/50">
                        {t("fichaje.atiende")}
                      </span>
                      <span className="block truncate font-semibold text-carbon">
                        {empleadoActivo.nombre}
                      </span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      salir();
                      cerrar();
                    }}
                    className="shrink-0 rounded-full bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100"
                  >
                    {t("fichaje.salir")}
                  </button>
                </div>
              )}
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3
                    id="fichaje-title"
                    className="font-display text-2xl uppercase tracking-tight text-carbon"
                  >
                    {empleadoActivo ? t("fichaje.cambiar") : t("fichaje.elegi")}
                  </h3>
                  <p className="mt-1 text-xs text-carbon/45">
                    {t("fichaje.elegiSub")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cerrar}
                  aria-label={t("qr.cerrar")}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-linea text-carbon/50"
                >
                  ✕
                </button>
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
                        {inicial(e.nombre)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-carbon">
                          {e.nombre}
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
              <Paginacion
                page={page}
                pageSize={PAGE_SIZE}
                total={conNombre.length}
                onChange={setPage}
              />
            </div>
          )}
        </ModalShell>
      )}
    </>
  );
};

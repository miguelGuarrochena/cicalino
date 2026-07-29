"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { Pagination, slicePage } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { isPin4 } from "@/lib/validations";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { isRealBranchId } from "@/lib/data/orders";
import { insertEmployee, removeEmployeeDb } from "@/lib/data/branch";

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 placeholder:text-carbon/40";
const PAGE_SIZE = 6;

const inicial = (name: string) => {
  return (name.trim()[0] || "?").toUpperCase();
};

type FieldErrors = {
  nombre?: string;
  pin?: string;
};

// Modal para dar de alta un empleado (nombre + puesto + PIN único de 4 dígitos).
export const EmployeeModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useApp();
  const toast = useToast();
  const employees = useConfigStore((s) => s.empleados);
  const addEmployee = useConfigStore((s) => s.agregarEmpleado);
  const pushEmpleado = useConfigStore((s) => s.pushEmpleado);
  const branchId = useSessionStore((s) => s.sucursalId);
  const live = supabaseConfigurado && isRealBranchId(branchId);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [pin, setPin] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty = Boolean(name.trim() || role.trim() || pin.trim());

  const intentarCerrar = () => {
    if (saving) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const validar = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!name.trim()) next.nombre = t("config.empNombreReq");
    // El duplicado ya no se chequea acá: los PINs no bajan al navegador.
    // Lo valida `set_empleado_pin` en la base y el error vuelve por el RPC.
    if (!isPin4(pin)) next.pin = t("config.empPinReq");
    return next;
  };

  const guardar = async () => {
    if (saving) return;
    const next = validar();
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      if (live && branchId) {
        const created = await insertEmployee(branchId, {
          nombre: name,
          rol: role,
          pin,
        });
        if (!created) {
          toast(t("toast.empError"), "error");
          return;
        }
        pushEmpleado(created);
      } else {
        addEmployee({ nombre: name, rol: role, pin });
      }
      toast(t("toast.empAgregado"), "success");
      onClose();
    } catch {
      toast(t("toast.empError"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      onClose={intentarCerrar}
      labelledBy="emp-modal-title"
      busy={saving}
      footer={
        confirmDiscard ? (
          <div className="flex flex-col gap-2.5">
            <p className="text-center text-sm font-semibold text-carbon">
              ¿Salir sin guardar?
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="w-full rounded-full border border-linea py-3 text-sm font-semibold text-carbon sm:flex-1"
              >
                Seguir
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-full bg-red-500 py-3 text-sm font-semibold text-white sm:flex-1"
              >
                Salir sin guardar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {dirty ? (
              <p className="text-center text-[11px] font-semibold text-marca">
                Completá y tocá Agregar para guardar
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void guardar()}
                disabled={saving}
                className="w-full rounded-full bg-marca px-4 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte disabled:opacity-60 sm:flex-1"
              >
                {saving ? "…" : t("config.guardarEmp")}
              </button>
              <button
                type="button"
                onClick={intentarCerrar}
                disabled={saving}
                className="w-full rounded-full border border-linea bg-crema/60 px-4 py-3 text-sm font-semibold text-carbon disabled:opacity-50 sm:flex-1"
              >
                {t("super.cancelar")}
              </button>
            </div>
          </div>
        )
      }
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id="emp-modal-title"
            className="font-display text-2xl uppercase tracking-tight text-carbon"
          >
            {t("config.agregar")}
          </h3>
          <p className="mt-1 text-sm text-carbon/55">{t("config.modalSub")}</p>
        </div>
        <ModalCloseBtn
          onClick={intentarCerrar}
          disabled={saving}
          label={t("qr.cerrar")}
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-carbon/70">
            {t("config.empNombre")} *
          </span>
          <input
            autoFocus
            disabled={saving}
            className={`${INPUT} ${errors.nombre ? "border-red-400" : ""}`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((er) => ({ ...er, nombre: undefined }));
            }}
            onKeyDown={(e) => e.key === "Enter" && void guardar()}
            placeholder="Lucía"
          />
          {errors.nombre && (
            <span className="text-xs text-red-500">{errors.nombre}</span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-carbon/70">
            {t("config.empRol")}
          </span>
          <input
            disabled={saving}
            className={INPUT}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void guardar()}
            placeholder={t("config.empRolPh")}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-carbon/70">
            {t("config.empPin")} *
          </span>
          <input
            disabled={saving}
            inputMode="numeric"
            maxLength={4}
            className={`${INPUT} tracking-[0.35em] ${errors.pin ? "border-red-400" : ""}`}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
              setErrors((er) => ({ ...er, pin: undefined }));
            }}
            onKeyDown={(e) => e.key === "Enter" && void guardar()}
            placeholder="••••"
          />
          <span className="text-xs text-carbon/45">{t("config.empPinHint")}</span>
          {errors.pin && (
            <span className="text-xs text-red-500">{errors.pin}</span>
          )}
        </label>
      </div>
    </ModalShell>
  );
};

export const EmployeeList = () => {
  const { t } = useApp();
  const toast = useToast();
  const employees = useConfigStore((s) => s.empleados);
  const removeEmployee = useConfigStore((s) => s.quitarEmpleado);
  const branchId = useSessionStore((s) => s.sucursalId);
  const live = supabaseConfigurado && isRealBranchId(branchId);
  const [modal, setModal] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [page, setPage] = useState(1);

  const pageItems = slicePage(employees, page, PAGE_SIZE);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-carbon/60">
            {t("config.seccionEmp")}
          </h2>
          <p className="mt-1 text-sm text-carbon/55">{t("config.seccionEmpSub")}</p>
        </div>
        <button
          type="button"
          onClick={() => setModal(true)}
          className="shrink-0 rounded-full border border-marca px-4 py-2 text-sm font-semibold text-marca transition hover:bg-marca hover:text-crema active:scale-95"
        >
          + {t("config.agregar")}
        </button>
      </div>

      {employees.length === 0 ? (
        <p className="py-6 text-center text-sm text-carbon/40">{t("config.sinEmp")}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {pageItems.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-2xl border border-linea bg-crema/30 px-3 py-3"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-marca/15 text-sm font-bold text-marca">
                  {inicial(e.nombre)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-carbon">{e.nombre}</p>
                  <p className="truncate text-xs text-carbon/50">
                    {e.rol || t("config.sinRol")}
                    {" · "}
                    {e.tienePin ? t("config.pinOk") : t("config.sinPin")}
                  </p>
                </div>
                {confirmId === e.id ? (
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      disabled={borrando}
                      onClick={async () => {
                        if (borrando) return;
                        setBorrando(true);
                        try {
                          if (live) await removeEmployeeDb(e.id);
                          removeEmployee(e.id);
                          setConfirmId(null);
                          toast(t("toast.empBorrado"), "info");
                          const remaining = employees.length - 1;
                          const maxPage = Math.max(
                            1,
                            Math.ceil(remaining / PAGE_SIZE),
                          );
                          if (page > maxPage) setPage(maxPage);
                        } finally {
                          setBorrando(false);
                        }
                      }}
                      className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
                    >
                      {borrando ? "…" : t("config.borrar")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/60"
                    >
                      {t("super.cancelar")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(e.id)}
                    aria-label={t("config.borrar")}
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-linea text-carbon/45 transition hover:border-red-300 hover:text-red-500"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={employees.length}
            onChange={setPage}
          />
        </>
      )}

      {modal && <EmployeeModal onClose={() => setModal(false)} />}
    </>
  );
};

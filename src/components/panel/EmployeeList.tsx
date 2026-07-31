"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { Pagination, slicePage } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { isPin4, isEmployeeNameTaken } from "@/lib/validations";
import { supabaseConfigured } from "@/lib/supabase/config";
import { isRealBranchId } from "@/lib/data/orders";
import {
  fetchEmployees,
  fetchOwners,
  insertEmployee,
  removeEmployeeDb,
  setEmployeePin,
  type OwnerUI,
} from "@/lib/data/branch";
import { grantAppAccess, revokeAppAccess } from "@/lib/actions/team";
import { isEmail } from "@/lib/validations";
import type { EmployeeUI } from "@/lib/store/config-store";

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 placeholder:text-carbon/40";
const PAGE_SIZE = 6;

const inicial = (name: string) => {
  return (name.trim()[0] || "?").toUpperCase();
};

type FieldErrors = {
  name?: string;
  pin?: string;
};

const mapPinError = (msg: string, t: (k: string) => string): string => {
  const lower = msg.toLowerCase();
  if (lower.includes("ya está en uso") || lower.includes("already")) {
    return t("config.empPinDup");
  }
  if (lower.includes("4 dígitos") || lower.includes("4 digits")) {
    return t("config.empPinReq");
  }
  return t("toast.empError");
};

export const EmployeeModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useApp();
  const toast = useToast();
  const employees = useConfigStore((s) => s.employees);
  const addEmployee = useConfigStore((s) => s.agregarEmpleado);
  const pushEmpleado = useConfigStore((s) => s.pushEmpleado);
  const branchId = useSessionStore((s) => s.sucursalId);
  const live = supabaseConfigured && isRealBranchId(branchId);

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
    if (!name.trim()) next.name = t("config.empNombreReq");
    else if (isEmployeeNameTaken(name, employees)) {
      next.name = t("config.empNombreDup");
    }
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
          name: name,
          rol: role,
          pin,
        });
        if (!created.ok) {
          if (created.reason === "nombre_dup") {
            setErrors({ name: t("config.empNombreDup") });
          } else if (created.reason === "pin_dup") {
            setErrors({ pin: t("config.empPinDup") });
          } else {
            toast(t("toast.empError"), "error");
          }
          return;
        }
        pushEmpleado(created.emp);
      } else {
        addEmployee({ name: name, rol: role, pin });
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
            className={`${INPUT} ${errors.name ? "border-red-400" : ""}`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((er) => ({ ...er, name: undefined }));
            }}
            onKeyDown={(e) => e.key === "Enter" && void guardar()}
            placeholder="Lucía"
          />
          {errors.name && (
            <span className="text-xs text-red-500">{errors.name}</span>
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

const ChangePinModal = ({
  emp,
  onClose,
}: {
  emp: EmployeeUI;
  onClose: () => void;
}) => {
  const { t } = useApp();
  const toast = useToast();
  const marcarPin = useConfigStore((s) => s.marcarPinEmpleado);
  const branchId = useSessionStore((s) => s.sucursalId);
  const live = supabaseConfigured && isRealBranchId(branchId);

  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (saving) return;
    if (!isPin4(pin)) {
      setError(t("config.empPinReq"));
      return;
    }
    setSaving(true);
    try {
      if (live) {
        const res = await setEmployeePin(emp.id, pin);
        if (!res.ok) {
          setError(mapPinError(res.error, t));
          return;
        }
      }
      marcarPin(emp.id, true);
      toast(t("toast.empPinCambiado"), "success");
      onClose();
    } catch {
      toast(t("toast.empError"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="emp-pin-modal-title"
      busy={saving}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={saving}
            className="w-full rounded-full bg-marca px-4 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte disabled:opacity-60 sm:flex-1"
          >
            {saving ? "…" : t("config.guardarPin")}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-full rounded-full border border-linea bg-crema/60 px-4 py-3 text-sm font-semibold text-carbon disabled:opacity-50 sm:flex-1"
          >
            {t("super.cancelar")}
          </button>
        </div>
      }
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id="emp-pin-modal-title"
            className="font-display text-2xl uppercase tracking-tight text-carbon"
          >
            {t("config.cambiarPin")}
          </h3>
          <p className="mt-1 text-sm text-carbon/55">
            {t("config.cambiarPinSub", { n: emp.name })}
          </p>
        </div>
        <ModalCloseBtn
          onClick={onClose}
          disabled={saving}
          label={t("qr.cerrar")}
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-carbon/70">
          {t("config.empPin")} *
        </span>
        <input
          autoFocus
          disabled={saving}
          inputMode="numeric"
          maxLength={4}
          className={`${INPUT} tracking-[0.35em] ${error ? "border-red-400" : ""}`}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
            setError(undefined);
          }}
          onKeyDown={(e) => e.key === "Enter" && void guardar()}
          placeholder="••••"
        />
        <span className="text-xs text-carbon/45">{t("config.empPinHint")}</span>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </label>
    </ModalShell>
  );
};


const AccessModal = ({
  emp,
  onClose,
  onDone,
}: {
  emp: EmployeeUI;
  onClose: () => void;
  onDone: () => void;
}) => {
  const { t } = useApp();
  const toast = useToast();
  const [email, setEmail] = useState(emp.email ?? "");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const tieneAcceso = Boolean(emp.usuarioId);

  const dar = async () => {
    if (saving) return;
    if (!isEmail(email)) {
      setError("Poné un email válido.");
      return;
    }
    setSaving(true);
    const res = await grantAppAccess({ employeeId: emp.id, email });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast("Le mandamos la invitación por mail", "success");
    onDone();
    onClose();
  };

  const quitar = async () => {
    if (saving) return;
    setSaving(true);
    const res = await revokeAppAccess({ employeeId: emp.id });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast("Ya no entra a la app", "info");
    onDone();
    onClose();
  };

  return (
    <ModalShell onClose={onClose} labelledBy="emp-acceso-title" busy={saving}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id="emp-acceso-title"
            className="font-display text-2xl uppercase tracking-tight text-carbon"
          >
            Acceso a la app
          </h3>
          <p className="mt-1 text-sm text-carbon/55">
            {tieneAcceso
              ? `${emp.name} entra a esta sucursal con su email.`
              : `${emp.name} solo ficha con PIN. Si le das acceso, va a poder abrir el panel de esta sucursal desde su celular.`}
          </p>
        </div>
        <ModalCloseBtn
          onClick={onClose}
          disabled={saving}
          label={t("qr.cerrar")}
        />
      </div>

      {tieneAcceso ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-linea bg-crema/40 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-carbon/45">
              Entra con
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-carbon">
              {emp.email ?? "—"}
            </p>
          </div>
          <p className="text-xs text-carbon/50">
            Ve los pedidos y la espera de esta sucursal. No ve precios, pagos ni
            datos de facturación.
          </p>
          {error && <span className="text-xs text-red-500">{error}</span>}
          <button
            type="button"
            onClick={() => void quitar()}
            disabled={saving}
            className="w-full rounded-full border border-red-300 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-500/10 disabled:opacity-60"
          >
            {saving ? "…" : "Quitar el acceso"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-carbon/70">
              Email de la persona *
            </span>
            <input
              autoFocus
              disabled={saving}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              className={`${INPUT} ${error ? "border-red-400" : ""}`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(undefined);
              }}
              onKeyDown={(e) => e.key === "Enter" && void dar()}
              placeholder="lucia@ejemplo.com"
            />
            <span className="text-xs text-carbon/45">
              Le llega un mail para poner su contraseña.
            </span>
            {error && <span className="text-xs text-red-500">{error}</span>}
          </label>
          <button
            type="button"
            onClick={() => void dar()}
            disabled={saving}
            className="w-full rounded-full bg-marca py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte disabled:opacity-60"
          >
            {saving ? "…" : "Dar acceso"}
          </button>
        </div>
      )}
    </ModalShell>
  );
};

export const EmployeeList = () => {
  const { t } = useApp();
  const toast = useToast();
  const employees = useConfigStore((s) => s.employees);
  const removeEmployee = useConfigStore((s) => s.quitarEmpleado);
  const setEmpleados = useConfigStore((s) => s.setEmpleados);
  const branchId = useSessionStore((s) => s.sucursalId);
  const orgId = useSessionStore((s) => s.organizationId);
  const rol = useSessionStore((s) => s.rol);
  const live = supabaseConfigured && isRealBranchId(branchId);
  const esDueno = rol === "admin" || rol === "superadmin";
  const [modal, setModal] = useState(false);
  const [pinEmp, setPinEmp] = useState<EmployeeUI | null>(null);
  const [accesoEmp, setAccesoEmp] = useState<EmployeeUI | null>(null);
  const [owners, setOwners] = useState<OwnerUI[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!esDueno || !live || !orgId) return;
    let alive = true;
    void fetchOwners(orgId).then((o) => {
      if (alive) setOwners(o);
    });
    return () => {
      alive = false;
    };
  }, [esDueno, live, orgId]);

  const recargar = () => {
    if (!live || !branchId) return;
    void fetchEmployees(branchId).then(setEmpleados);
  };

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

      {esDueno && owners.length > 0 && (
        <ul className="mb-2 flex flex-col gap-2">
          {owners.map((o) => (
            <li
              key={o.id}
              className="flex items-center gap-3 rounded-2xl border border-marca/25 bg-marca/5 px-3 py-3"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-marca text-sm font-bold text-crema">
                {inicial(o.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-semibold text-carbon">
                  {o.name}
                  <span className="shrink-0 rounded-full bg-marca/15 px-2 py-0.5 text-[11px] font-semibold text-marca">
                    Dueño
                  </span>
                </p>
                <p className="truncate text-xs text-carbon/50">
                  {o.email} · ve todas las sucursales
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

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
                  {inicial(e.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-semibold text-carbon">
                    {e.name}
                    {e.usuarioId && (
                      <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Entra a la app
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-carbon/50">
                    {e.rol || t("config.sinRol")}
                    {" · "}
                    {e.tienePin ? t("config.pinOk") : t("config.sinPin")}
                    {e.usuarioId && e.email ? ` · ${e.email}` : ""}
                  </p>
                </div>
                {confirmId === e.id ? (
                  <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
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
                      className="w-full rounded-full bg-red-500 text-white transition hover:bg-red-600 disabled:opacity-60 sm:w-auto flex min-h-11 items-center justify-center px-4 text-sm font-semibold sm:min-h-0 sm:py-2 sm:text-xs"
                    >
                      {borrando ? "…" : t("config.borrar")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="w-full rounded-full border border-linea text-carbon/60 sm:w-auto flex min-h-11 items-center justify-center px-4 text-sm font-semibold sm:min-h-0 sm:py-2 sm:text-xs"
                    >
                      {t("super.cancelar")}
                    </button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {esDueno && live && (
                      <button
                        type="button"
                        onClick={() => setAccesoEmp(e)}
                        aria-label="Acceso a la app"
                        title="Acceso a la app"
                        className={`flex size-10 shrink-0 items-center justify-center rounded-xl border transition ${
                          e.usuarioId
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                            : "border-linea text-carbon/45 hover:border-marca hover:text-marca"
                        }`}
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
                          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                          <path d="M10 17l5-5-5-5" />
                          <path d="M15 12H3" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPinEmp(e)}
                      aria-label={t("config.cambiarPin")}
                      title={t("config.cambiarPin")}
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-linea text-carbon/45 transition hover:border-marca hover:text-marca"
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
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </button>
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
                  </div>
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
      {pinEmp && (
        <ChangePinModal emp={pinEmp} onClose={() => setPinEmp(null)} />
      )}
      {accesoEmp && (
        <AccessModal
          emp={accesoEmp}
          onClose={() => setAccesoEmp(null)}
          onDone={recargar}
        />
      )}
    </>
  );
};

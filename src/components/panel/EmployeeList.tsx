"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useConfigStore } from "@/lib/store/config-store";
import { ModalShell } from "@/components/ui/ModalShell";
import { Pagination, slicePage } from "@/components/ui/Pagination";
import { isPin4, pinEnUso } from "@/lib/validations";

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
  const employees = useConfigStore((s) => s.empleados);
  const addEmployee = useConfigStore((s) => s.agregarEmpleado);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [pin, setPin] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const validar = (): FieldErrors => {
        const next: FieldErrors = {};
        if (!name.trim()) next.nombre = t("config.empNombreReq");
        if (!isPin4(pin)) next.pin = t("config.empPinReq");
        else if (pinEnUso(pin, employees)) next.pin = t("config.empPinDup");
        return next;
      };

  const guardar = () => {
        const next = validar();
        setErrors(next);
        if (Object.keys(next).length) return;
        addEmployee({ nombre: name, rol: role, pin });
        onClose();
      };

  return (
    <ModalShell onClose={onClose} labelledBy="emp-modal-title">
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
        <button
          type="button"
          onClick={onClose}
          aria-label={t("qr.cerrar")}
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-linea text-carbon/50 transition hover:bg-carbon/5"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-carbon/70">
            {t("config.empNombre")} *
          </span>
          <input
            autoFocus
            className={`${INPUT} ${errors.nombre ? "border-red-400" : ""}`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((er) => ({ ...er, nombre: undefined }));
            }}
            onKeyDown={(e) => e.key === "Enter" && guardar()}
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
            className={INPUT}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && guardar()}
            placeholder={t("config.empRolPh")}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-carbon/70">
            {t("config.empPin")} *
          </span>
          <input
            inputMode="numeric"
            maxLength={4}
            className={`${INPUT} tracking-[0.35em] ${errors.pin ? "border-red-400" : ""}`}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
              setErrors((er) => ({ ...er, pin: undefined }));
            }}
            onKeyDown={(e) => e.key === "Enter" && guardar()}
            placeholder="••••"
          />
          <span className="text-xs text-carbon/45">{t("config.empPinHint")}</span>
          {errors.pin && (
            <span className="text-xs text-red-500">{errors.pin}</span>
          )}
        </label>
      </div>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-full border border-linea px-4 py-3 text-sm font-semibold text-carbon transition hover:bg-carbon/5"
        >
          {t("qr.cerrar")}
        </button>
        <button
          type="button"
          onClick={guardar}
          className="flex-1 rounded-full bg-marca px-4 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
        >
          {t("config.guardarEmp")}
        </button>
      </div>
    </ModalShell>
  );
};

export const EmployeeList = () => {
  const { t } = useApp();
  const employees = useConfigStore((s) => s.empleados);
  const removeEmployee = useConfigStore((s) => s.quitarEmpleado);
  const [modal, setModal] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
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
                    {e.pin ? t("config.pinOk") : t("config.sinPin")}
                  </p>
                </div>
                {confirmId === e.id ? (
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => {
                        removeEmployee(e.id);
                        setConfirmId(null);
                        const remaining = employees.length - 1;
                        const maxPage = Math.max(
                          1,
                          Math.ceil(remaining / PAGE_SIZE),
                        );
                        if (page > maxPage) setPage(maxPage);
                      }}
                      className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-600"
                    >
                      {t("config.borrar")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/60"
                    >
                      {t("qr.cerrar")}
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/ui/ModalShell";
import { useApp } from "@/components/providers/Providers";
import {
  useSuperadminStore,
  PRECIO_POR_SUCURSAL,
  monthlyCharge,
  type OrganizationRow,
  type OrgInput,
  type BranchInput,
} from "@/lib/store/superadmin-store";
import type { TipoNegocio } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { isEmail, isCuil } from "@/lib/validations";

const required = (v: string) => v.trim().length > 0;
const emailOk = isEmail;
const cuilOk = (v: string) => !v.trim() || isCuil(v);

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const TIPO_LABEL: Record<TipoNegocio, string> = {
  cafeteria: "Cafetería",
  panaderia: "Panadería",
  rotiseria: "Rotisería",
  heladeria: "Heladería",
  otro: "Otro",
};

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-3 py-2.5 text-sm text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20";

const Campo = ({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string | null;
}) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="font-medium text-carbon/70">{label}</span>
    {children}
    {error && <span className="text-xs text-red-500">{error}</span>}
  </label>
);

type Mode = "crear" | "ver" | "editar";

export const OrgModal = ({
  mode: initialMode,
  org,
  onClose,
}: {
  mode: Mode;
  org?: OrganizationRow;
  onClose: () => void;
}) => {
  const { t } = useApp();
  const router = useRouter();
  const {
    altaOrg: createOrg,
    actualizarOrg,
    toggleOrgActivo,
    toggleOrgPagado,
    quitarOrg,
    altaSucursal: createBranch,
    toggleSucursalActivo: toggleBranchActive,
    quitarSucursal: removeBranch,
  } = useSuperadminStore();
  const enterAsOwner = useSessionStore((s) => s.entrarComoDueño);

  const [mode, setMode] = useState<Mode>(initialMode);
  const editing = mode === "crear" || mode === "editar";

  const [name, setName] = useState(org?.nombre ?? "");
  const [manager, setResponsable] = useState(org?.responsable ?? "");
  const [cuil, setCuil] = useState(org?.cuil ?? "");
  const [address, setDireccion] = useState(org?.direccion ?? "");
  const [ownerEmail, setOwnerEmail] = useState(org?.duenoEmail ?? "");
  const [quota, setCupo] = useState(org?.cupo ?? 1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = useState(false);
  const [quotaError, setCupoError] = useState(false);

  // Alta sucursal rápida
  const [newBranch, setNuevaSuc] = useState("");
  const [nuevaTipo, setNuevaTipo] = useState<TipoNegocio>("cafeteria");

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!required(name)) e.nombre = t("super.errNombre");
    if (!required(manager)) e.responsable = t("super.errResponsable");
    if (!emailOk(ownerEmail)) e.duenoEmail = t("super.errEmail");
    if (cuil && !cuilOk(cuil)) e.cuil = t("super.errCuil");
    if (quota < 1) e.cupo = t("super.errCupo");
    if (org && quota < org.sucursales.length) e.cupo = t("super.errCupoBajo");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const guardar = () => {
    if (!validate()) return;
    const data: OrgInput = {
      nombre: name,
      responsable: manager,
      cuil,
      direccion: address,
      duenoEmail: ownerEmail,
      cupo: quota,
    };
    if (mode === "crear") {
      createOrg(data);
      onClose();
      return;
    }
    if (org) {
      actualizarOrg(org.id, data);
      setMode("ver");
    }
  };

  const agregarSuc = () => {
    if (!org || !newBranch.trim()) return;
    const data: BranchInput = {
      nombre: newBranch.trim(),
      tipo: nuevaTipo,
      direccion: org.direccion,
    };
    const res = createBranch(org.id, data);
    if (!res.ok) {
      setCupoError(true);
      return;
    }
    setCupoError(false);
    setNuevaSuc("");
  };

  const enterOwner = (branchId: string, branchNameLabel: string) => {
    if (!org) return;
    enterAsOwner({
      organizacionId: org.id,
      organizacionNombre: org.nombre,
      sucursalId: branchId,
      sucursalNombre: branchNameLabel,
    });
    onClose();
    router.push("/panel");
  };

  const fresca = useSuperadminStore((s) =>
    org ? s.organizaciones.find((o) => o.id === org.id) : undefined,
  );
  const vista = fresca ?? org;

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="org-modal-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-marca">
            {mode === "crear"
              ? t("super.alta")
              : mode === "editar"
                ? t("super.editar")
                : t("super.detalle")}
          </p>
          <h2
            id="org-modal-title"
            className="mt-1 font-display text-2xl uppercase tracking-tight text-carbon"
          >
            {mode === "crear" ? t("super.nuevaOrg") : vista?.nombre}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/60"
        >
          {t("qr.cerrar")}
        </button>
      </div>

      {editing ? (
        <div className="mt-5 flex flex-col gap-3">
          <Campo label={t("super.nombreOrg")} error={errors.nombre}>
            <input
              className={INPUT}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Campo>
          <Campo label={t("super.responsable")} error={errors.responsable}>
            <input
              className={INPUT}
              value={manager}
              onChange={(e) => setResponsable(e.target.value)}
            />
          </Campo>
          <Campo label={t("super.emailDueno")} error={errors.duenoEmail}>
            <input
              className={INPUT}
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
            />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label={t("super.cuil")} error={errors.cuil}>
              <input
                className={INPUT}
                value={cuil}
                onChange={(e) => setCuil(e.target.value)}
              />
            </Campo>
            <Campo label={t("super.cupo")} error={errors.cupo}>
              <input
                className={INPUT}
                type="number"
                min={1}
                value={quota}
                onChange={(e) => setCupo(parseInt(e.target.value, 10) || 1)}
              />
            </Campo>
          </div>
          <Campo label={t("super.direccion")}>
            <input
              className={INPUT}
              value={address}
              onChange={(e) => setDireccion(e.target.value)}
            />
          </Campo>
          <p className="text-xs text-carbon/50">
            {t("super.cobroEstimado", {
              n: money.format(quota * PRECIO_POR_SUCURSAL),
            })}
          </p>
          <div className="mt-2 flex gap-2">
            {mode === "editar" && (
              <button
                type="button"
                onClick={() => setMode("ver")}
                className="flex-1 rounded-full border border-linea py-2.5 text-sm font-semibold text-carbon/70"
              >
                {t("super.cancelar")}
              </button>
            )}
            <button
              type="button"
              onClick={guardar}
              className="flex-1 rounded-full bg-marca py-2.5 text-sm font-semibold text-crema hover:bg-marca-fuerte"
            >
              {t("super.guardar")}
            </button>
          </div>
        </div>
      ) : vista ? (
        <div className="mt-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Dato label={t("super.responsable")} value={vista.responsable} />
            <Dato label={t("super.emailDueno")} value={vista.duenoEmail} />
            <Dato label={t("super.cuil")} value={vista.cuil || "—"} />
            <Dato
              label={t("super.cupo")}
              value={`${vista.sucursales.length} / ${vista.cupo}`}
            />
            <Dato
              label={t("super.cobro")}
              value={money.format(monthlyCharge(vista))}
            />
            <Dato
              label={t("super.direccion")}
              value={vista.direccion || "—"}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => toggleOrgPagado(vista.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                vista.pagado
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-600"
              }`}
            >
              {vista.pagado ? t("super.pagado") : t("super.impago")}
            </button>
            <button
              type="button"
              onClick={() => toggleOrgActivo(vista.id)}
              className="rounded-full bg-carbon/8 px-3 py-1.5 text-xs font-semibold text-carbon/70"
            >
              {vista.activo ? t("super.pausar") : t("super.activar")}
            </button>
            <button
              type="button"
              onClick={() => setMode("editar")}
              className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/70"
            >
              {t("super.editar")}
            </button>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-carbon/45">
              {t("super.sucursales")}
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {vista.sucursales.map((suc) => (
                <li
                  key={suc.id}
                  className="flex flex-col gap-2 rounded-2xl border border-linea bg-crema/40 px-3 py-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-carbon">{suc.nombre}</p>
                    <p className="truncate text-xs text-carbon/50">
                      {TIPO_LABEL[suc.tipo]} · {suc.direccion || "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => enterOwner(suc.id, suc.nombre)}
                      className="rounded-full bg-marca px-3 py-1.5 text-xs font-semibold text-crema"
                    >
                      {t("super.entrarComo")}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleBranchActive(vista.id, suc.id)}
                      className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/60"
                    >
                      {suc.activo ? t("super.pausar") : t("super.activar")}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBranch(vista.id, suc.id)}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold text-red-600/80"
                    >
                      {t("super.eliminar")}
                    </button>
                  </div>
                </li>
              ))}
              {vista.sucursales.length === 0 && (
                <p className="text-sm text-carbon/45">{t("super.sinSucursales")}</p>
              )}
            </ul>

            <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-dashed border-linea p-3">
              <p className="text-xs font-semibold text-carbon/55">
                {t("super.agregarSucursal")}
              </p>
              {quotaError && (
                <p className="text-xs text-red-500">{t("super.cupoLleno")}</p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className={INPUT}
                  placeholder={t("super.nombreSucursal")}
                  value={newBranch}
                  onChange={(e) => setNuevaSuc(e.target.value)}
                />
                <select
                  className={INPUT}
                  value={nuevaTipo}
                  onChange={(e) => setNuevaTipo(e.target.value as TipoNegocio)}
                >
                  {(Object.keys(TIPO_LABEL) as TipoNegocio[]).map((k) => (
                    <option key={k} value={k}>
                      {TIPO_LABEL[k]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={agregarSuc}
                  className="rounded-full bg-marca px-4 py-2.5 text-sm font-semibold text-crema"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {!confirmDel ? (
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              className="text-xs font-semibold text-red-600/70 hover:text-red-600"
            >
              {t("super.eliminar")}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDel(false)}
                className="flex-1 rounded-full border border-linea py-2 text-sm"
              >
                {t("super.cancelar")}
              </button>
              <button
                type="button"
                onClick={() => {
                  quitarOrg(vista.id);
                  onClose();
                }}
                className="flex-1 rounded-full bg-red-600 py-2 text-sm font-semibold text-white"
              >
                {t("super.confirmarEliminar")}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </ModalShell>
  );
};

const Dato = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-[11px] text-carbon/40">{label}</p>
    <p className="mt-0.5 font-medium text-carbon/80">{value}</p>
  </div>
);

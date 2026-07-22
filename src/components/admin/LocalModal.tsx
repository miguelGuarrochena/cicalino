"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import {
  useSuperadminStore,
  type LocalRow,
  type PlanId,
} from "@/lib/store/superadmin-store";
import { useSessionStore } from "@/lib/store/session-store";
import type { TipoNegocio } from "@/lib/store/config-store";
import { ModalShell } from "@/components/ui/ModalShell";
import { formatCuil, isCuil, isEmail } from "@/lib/validations";

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 placeholder:text-carbon/40";

const TIPO_LABEL: Record<TipoNegocio, string> = {
  cafeteria: "Cafetería",
  panaderia: "Panadería",
  rotiseria: "Rotisería",
  heladeria: "Heladería",
  otro: "Otro",
};

type Mode = "ver" | "editar" | "crear";

type FieldErrors = {
  nombre?: string;
  responsable?: string;
  email?: string;
  cuil?: string;
  direccion?: string;
};

interface Props {
  mode: Mode;
  local?: LocalRow | null;
  onClose: () => void;
}

const Campo = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-carbon/70">{label}</span>
      {children}
    </label>
  );
};

const Dato = ({ label, value }: { label: string; value: string }) => {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-carbon/40">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-carbon">{value || "—"}</p>
    </div>
  );
};

export const LocalModal = ({ mode: initialMode, local, onClose }: Props) => {
  const { t } = useApp();
  const router = useRouter();
  const entrarComoDueño = useSessionStore((s) => s.entrarComoDueño);
  const { altaLocal, actualizarLocal, quitarLocal, toggleActivo, togglePagado } =
    useSuperadminStore();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [nombre, setNombre] = useState(local?.nombre ?? "");
  const [tipo, setTipo] = useState<TipoNegocio>(local?.tipo ?? "cafeteria");
  const [email, setEmail] = useState(local?.adminEmail ?? "");
  const [responsable, setResponsable] = useState(local?.responsable ?? "");
  const [cuil, setCuil] = useState(local?.cuil ?? "");
  const [direccion, setDireccion] = useState(local?.direccion ?? "");
  const [plan, setPlan] = useState<PlanId>(local?.plan ?? "base");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirmBorrar, setConfirmBorrar] = useState(false);

  const validar = (): FieldErrors => {
        const next: FieldErrors = {};
        if (!nombre.trim()) next.nombre = t("super.errNombre");
        if (!responsable.trim()) next.responsable = t("super.errResponsable");
        if (!isEmail(email)) next.email = t("super.errEmail");
        if (!isCuil(cuil)) next.cuil = t("super.errCuil");
        if (!direccion.trim()) next.direccion = t("super.errDireccion");
        return next;
      };

  const guardar = () => {
        const next = validar();
        setErrors(next);
        if (Object.keys(next).length) return;
        const data = {
          nombre: nombre.trim(),
          tipo,
          adminEmail: email.trim(),
          responsable: responsable.trim(),
          cuil: formatCuil(cuil),
          direccion: direccion.trim(),
          plan,
        };
        if (mode === "crear") {
          altaLocal(data);
          onClose();
          return;
        }
        if (local) {
          actualizarLocal(local.id, data);
          setMode("ver");
          setErrors({});
        }
      };

  const borrar = () => {
        if (!local) return;
        quitarLocal(local.id);
        onClose();
      };

  const titulo =
    mode === "crear"
      ? t("super.alta")
      : mode === "editar"
        ? t("super.editar")
        : local?.nombre ?? t("super.detalle");

  return (
    <ModalShell onClose={onClose} labelledBy="local-modal-title">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id="local-modal-title"
            className="font-display text-2xl uppercase tracking-tight text-carbon"
          >
            {titulo}
          </h3>
          {mode === "ver" && local && (
            <p className="mt-1 text-sm text-carbon/55">
              {TIPO_LABEL[local.tipo]} · {local.plan}
            </p>
          )}
          {mode === "crear" && (
            <p className="mt-1 text-sm text-carbon/55">{t("super.modalSub")}</p>
          )}
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

      {mode === "ver" && local ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Dato label={t("super.responsable")} value={local.responsable} />
            <Dato label={t("super.cuil")} value={local.cuil} />
            <Dato label={t("super.emailAdmin")} value={local.adminEmail} />
            <Dato label={t("super.direccion")} value={local.direccion} />
            <Dato label={t("super.plan")} value={local.plan} />
            <Dato
              label={t("super.estado")}
              value={
                local.activo
                  ? `${t("super.activo")}${local.pagado ? ` · ${t("super.pagado")}` : ` · ${t("super.impago")}`}`
                  : t("super.pausado")
              }
            />
          </div>

          <div className="flex flex-wrap gap-2 border-t border-linea pt-4">
            <button
              type="button"
              onClick={() => {
                entrarComoDueño({
                  localId: local.id,
                  localNombre: local.nombre,
                });
                onClose();
                router.push("/panel");
              }}
              className="w-full rounded-full bg-carbon px-4 py-2.5 text-sm font-semibold text-crema transition hover:opacity-90 sm:w-auto"
            >
              {t("super.entrarComo")}
            </button>
            <button
              type="button"
              onClick={() => setMode("editar")}
              className="rounded-full bg-marca px-4 py-2.5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte"
            >
              {t("super.editar")}
            </button>
            <button
              type="button"
              onClick={() => togglePagado(local.id)}
              className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                local.pagado
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-600"
              }`}
            >
              {local.pagado ? t("super.pagado") : t("super.impago")}
            </button>
            <button
              type="button"
              onClick={() => toggleActivo(local.id)}
              className="rounded-full bg-carbon/8 px-4 py-2.5 text-sm font-semibold text-carbon/70 transition hover:bg-carbon/15"
            >
              {local.activo ? t("super.pausar") : t("super.activar")}
            </button>
            {!confirmBorrar ? (
              <button
                type="button"
                onClick={() => setConfirmBorrar(true)}
                className="ml-auto rounded-full border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-500 transition hover:bg-red-50"
              >
                {t("super.eliminar")}
              </button>
            ) : (
              <div className="ml-auto flex gap-1.5">
                <button
                  type="button"
                  onClick={borrar}
                  className="rounded-full bg-red-500 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  {t("super.confirmarEliminar")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBorrar(false)}
                  className="rounded-full border border-linea px-4 py-2.5 text-sm font-semibold text-carbon/60"
                >
                  {t("qr.cerrar")}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Campo label={`${t("super.nombreLocal")} *`}>
            <input
              autoFocus
              className={`${INPUT} ${errors.nombre ? "border-red-400" : ""}`}
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                setErrors((er) => ({ ...er, nombre: undefined }));
              }}
              placeholder="Café Demo"
            />
            {errors.nombre && (
              <span className="text-xs text-red-500">{errors.nombre}</span>
            )}
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label={t("super.tipo")}>
              <select
                className={INPUT}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoNegocio)}
              >
                {(Object.keys(TIPO_LABEL) as TipoNegocio[]).map((k) => (
                  <option key={k} value={k}>
                    {TIPO_LABEL[k]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label={t("super.plan")}>
              <select
                className={INPUT}
                value={plan}
                onChange={(e) => setPlan(e.target.value as PlanId)}
              >
                <option value="prueba">Prueba</option>
                <option value="base">Base</option>
                <option value="pro">Pro</option>
              </select>
            </Campo>
          </div>
          <Campo label={`${t("super.responsable")} *`}>
            <input
              className={`${INPUT} ${errors.responsable ? "border-red-400" : ""}`}
              value={responsable}
              onChange={(e) => {
                setResponsable(e.target.value);
                setErrors((er) => ({ ...er, responsable: undefined }));
              }}
              placeholder="Ana Pérez"
            />
            {errors.responsable && (
              <span className="text-xs text-red-500">{errors.responsable}</span>
            )}
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label={`${t("super.cuil")} *`}>
              <input
                className={`${INPUT} ${errors.cuil ? "border-red-400" : ""}`}
                value={cuil}
                onChange={(e) => {
                  setCuil(formatCuil(e.target.value));
                  setErrors((er) => ({ ...er, cuil: undefined }));
                }}
                placeholder="20-12345678-9"
                inputMode="numeric"
              />
              {errors.cuil && (
                <span className="text-xs text-red-500">{errors.cuil}</span>
              )}
            </Campo>
            <Campo label={`${t("super.emailAdmin")} *`}>
              <input
                type="email"
                className={`${INPUT} ${errors.email ? "border-red-400" : ""}`}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((er) => ({ ...er, email: undefined }));
                }}
                placeholder="dueno@local.com"
              />
              {errors.email && (
                <span className="text-xs text-red-500">{errors.email}</span>
              )}
            </Campo>
          </div>
          <Campo label={`${t("super.direccion")} *`}>
            <input
              className={`${INPUT} ${errors.direccion ? "border-red-400" : ""}`}
              value={direccion}
              onChange={(e) => {
                setDireccion(e.target.value);
                setErrors((er) => ({ ...er, direccion: undefined }));
              }}
              placeholder="Av. Corrientes 1234, CABA"
            />
            {errors.direccion && (
              <span className="text-xs text-red-500">{errors.direccion}</span>
            )}
          </Campo>

          <div className="mt-2 flex gap-2">
            {mode === "editar" && (
              <button
                type="button"
                onClick={() => {
                  setMode("ver");
                  setErrors({});
                }}
                className="flex-1 rounded-full border border-linea px-4 py-3 text-sm font-semibold text-carbon transition hover:bg-carbon/5"
              >
                {t("qr.cerrar")}
              </button>
            )}
            {mode === "crear" && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full border border-linea px-4 py-3 text-sm font-semibold text-carbon transition hover:bg-carbon/5"
              >
                {t("qr.cerrar")}
              </button>
            )}
            <button
              type="button"
              onClick={guardar}
              className="flex-1 rounded-full bg-marca px-4 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
            >
              {mode === "crear" ? t("super.crear") : t("super.guardar")}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
};

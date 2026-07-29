"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/ui/ModalShell";
import { useApp } from "@/components/providers/Providers";
import {
  useSuperadminStore,
  PRECIO_POR_SUCURSAL,
  cobroProximo,
  montoMensual,
  enGracia,
  pendienteContrato,
  type OrganizationRow,
  type OrgInput,
  type BranchInput,
  type PlanTipo,
} from "@/lib/store/superadmin-store";
import { sumarCicloCobro } from "@/lib/billing";
import type { TipoNegocio } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { isEmail, isCuil, isWhatsapp } from "@/lib/validations";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { supabaseConfigurado } from "@/lib/supabase/config";
import {
  crearOrganizacion,
  eliminarOrganizacion,
} from "@/lib/actions/superadmin";
import {
  refreshOrganizations,
  updateOrgDb,
  insertBranchDb,
  deleteBranchDb,
} from "@/lib/data/superadmin";
import { enviarLinkContrato } from "@/lib/actions/contrato";

const required = (v: string) => v.trim().length > 0;
const emailOk = isEmail;
const cuilOk = (v: string) => !v.trim() || isCuil(v);

type DraftOrg = {
  nombre: string;
  responsable: string;
  telefono: string;
  cuil: string;
  direccion: string;
  duenoEmail: string;
  cupo: number;
  plan: PlanTipo;
};

const draftVacio = (): DraftOrg => ({
  nombre: "",
  responsable: "",
  telefono: "",
  cuil: "",
  direccion: "",
  duenoEmail: "",
  cupo: 1,
  plan: "mensual",
});

const draftDesdeOrg = (o: OrganizationRow): DraftOrg => ({
  nombre: o.nombre,
  responsable: o.responsable,
  telefono: o.telefono,
  cuil: o.cuil,
  direccion: o.direccion,
  duenoEmail: o.duenoEmail,
  cupo: o.cupo,
  plan: o.plan,
});

const draftsIguales = (a: DraftOrg, b: DraftOrg): boolean =>
  a.nombre.trim() === b.nombre.trim() &&
  a.responsable.trim() === b.responsable.trim() &&
  a.telefono.trim() === b.telefono.trim() &&
  a.cuil.trim() === b.cuil.trim() &&
  a.direccion.trim() === b.direccion.trim() &&
  a.duenoEmail.trim() === b.duenoEmail.trim() &&
  a.cupo === b.cupo &&
  a.plan === b.plan;


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

const PLAN_LABEL: Record<PlanTipo, string> = {
  mensual: "Mensual",
  anual: "Anual",
  gratis: "Gratis",
};

const PLAN_HELP: Record<PlanTipo, string> = {
  mensual: "Cobro cada mes por sucursal contratada.",
  anual: "Un solo cobro por año (precio de 10 meses: 2 de regalo).",
  gratis: "Sin cobro. Cortesía permanente, no es el mes de prueba.",
};

const fechaCorta = (iso: string): string =>
  new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

/** Texto del próximo cobro según plan / cortesía / pagado. */
const textoProximoCobro = (org: OrganizationRow): string => {
  if (pendienteContrato(org) && !org.activo) {
    return "Esperando que el cliente acepte las condiciones.";
  }
  if (org.plan === "gratis") return "Sin próximo cobro (plan gratis).";
  if (enGracia(org) && org.mesGratisHasta) {
    const ciclo = org.plan === "anual" ? "anual" : "mensual";
    return `Cortesía hasta el ${fechaCorta(org.mesGratisHasta)}. Después empieza el ciclo ${ciclo}.`;
  }
  if (!org.activo) return "Cuenta pausada: no se cobra.";
  if (org.proximoCobroEn) {
    const fecha = fechaCorta(org.proximoCobroEn);
    if (!org.pagado) return `Pendiente de cobro · vencía el ${fecha}.`;
    return org.plan === "anual"
      ? `Próximo cobro anual: ${fecha}.`
      : `Próximo cobro mensual: ${fecha}.`;
  }
  if (org.pagado) {
    return org.plan === "anual"
      ? "Al día. Marcá Pagado de nuevo al cobrar el próximo año (queda cargada la fecha)."
      : "Al día. Marcá Pagado al cobrar el próximo mes (queda cargada la fecha).";
  }
  return org.plan === "anual"
    ? "Pendiente: cobrá el año completo."
    : "Pendiente: cobrá el mes en curso.";
};

const montoPlanPreview = (plan: PlanTipo, cupo: number): number => {
  if (plan === "gratis") return 0;
  const mes = cupo * PRECIO_POR_SUCURSAL;
  return plan === "anual" ? mes * 10 : mes;
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
  const toast = useToast();
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
    darMesGratis: giveFreeMonth,
  } = useSuperadminStore();
  const enterAsOwner = useSessionStore((s) => s.entrarComoDueño);
  const live = supabaseConfigurado;

  const [mode, setMode] = useState<Mode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const editing = mode === "crear" || mode === "editar";

  const [name, setName] = useState(org?.nombre ?? "");
  const [manager, setResponsable] = useState(org?.responsable ?? "");
  const [phone, setTelefono] = useState(org?.telefono ?? "");
  const [cuil, setCuil] = useState(org?.cuil ?? "");
  const [address, setDireccion] = useState(org?.direccion ?? "");
  const [ownerEmail, setOwnerEmail] = useState(org?.duenoEmail ?? "");
  const [quota, setCupo] = useState(org?.cupo ?? 1);
  const [plan, setPlan] = useState<PlanTipo>(org?.plan ?? "mensual");
  const [baseline, setBaseline] = useState<DraftOrg>(() =>
    initialMode === "crear" || !org ? draftVacio() : draftDesdeOrg(org),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = useState(false);
  const [quotaError, setCupoError] = useState(false);

  // Alta sucursal rápida
  const [newBranch, setNuevaSuc] = useState("");
  const [nuevaTipo, setNuevaTipo] = useState<TipoNegocio>("cafeteria");

  const draftActual = (): DraftOrg => ({
    nombre: name,
    responsable: manager,
    telefono: phone,
    cuil,
    direccion: address,
    duenoEmail: ownerEmail,
    cupo: quota,
    plan,
  });

  const dirty = editing && !draftsIguales(draftActual(), baseline);

  const aplicarDraft = (d: DraftOrg) => {
    setName(d.nombre);
    setResponsable(d.responsable);
    setTelefono(d.telefono);
    setCuil(d.cuil);
    setDireccion(d.direccion);
    setOwnerEmail(d.duenoEmail);
    setCupo(d.cupo);
    setPlan(d.plan);
  };

  const entrarEditar = (o: OrganizationRow) => {
    const d = draftDesdeOrg(o);
    aplicarDraft(d);
    setBaseline(d);
    setConfirmDiscard(false);
    setErrors({});
    setMode("editar");
  };

  const salirFormLimpio = () => {
    setConfirmDiscard(false);
    setErrors({});
    if (mode === "editar") setMode("ver");
    else onClose();
  };

  const intentarSalirForm = () => {
    if (saving) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    salirFormLimpio();
  };

  const descartarYSalir = () => {
    aplicarDraft(baseline);
    salirFormLimpio();
  };

  const mandarContrato = async () => {
    if (!vista || busy) return;
    setBusy(true);
    try {
      const r = await enviarLinkContrato(vista.id);
      if (!r.ok) {
        toast(r.error, "error");
        return;
      }
      if (r.url) {
        try {
          await navigator.clipboard.writeText(r.url);
        } catch {
          /* ignore */
        }
      }
      toast("Link de condiciones enviado (y copiado)", "success");
    } finally {
      setBusy(false);
    }
  };
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!required(name)) e.nombre = t("super.errNombre");
    if (!required(manager)) e.responsable = t("super.errResponsable");
    if (!required(phone) || !isWhatsapp(phone))
      e.telefono = t("super.errTelefono");
    if (!emailOk(ownerEmail)) e.duenoEmail = t("super.errEmail");
    if (cuil && !cuilOk(cuil)) e.cuil = t("super.errCuil");
    if (quota < 1) e.cupo = t("super.errCupo");
    if (org && quota < org.sucursales.length) e.cupo = t("super.errCupoBajo");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const guardar = async () => {
    if (!validate()) return;
    const data: OrgInput = {
      nombre: name,
      responsable: manager,
      telefono: phone,
      cuil,
      direccion: address,
      duenoEmail: ownerEmail,
      cupo: quota,
      plan,
    };
    if (mode === "crear") {
      if (live) {
        setSaving(true);
        const res = await crearOrganizacion({ ...data, sucursales: [] });
        setSaving(false);
        if (!res.ok) {
          setErrors((e) => ({ ...e, nombre: res.error }));
          toast(t("toast.orgError"), "error");
          return;
        }
        await refreshOrganizations();
      } else {
        createOrg(data);
      }
      toast(t("toast.orgCreada"), "success");
      onClose();
      return;
    }
    if (org) {
      if (live) {
        setSaving(true);
        // Cupo se maneja en el detalle (sucursales), no en este formulario.
        await updateOrgDb(org.id, { ...data, cupo: org.cupo });
        await refreshOrganizations();
        setSaving(false);
      } else {
        actualizarOrg(org.id, { ...data, cupo: org.cupo });
      }
      toast(t("toast.orgGuardada"), "success");
      onClose();
    }
  };

  const agregarSuc = async () => {
    if (!org || !newBranch.trim() || busy) return;
    const data: BranchInput = {
      nombre: newBranch.trim(),
      tipo: nuevaTipo,
      direccion: org.direccion,
    };
    const usadas = vista?.sucursales.length ?? 0;
    const cupoActual = vista?.cupo ?? 0;
    const necesitaCupo = usadas >= cupoActual;

    if (live) {
      setBusy(true);
      try {
        if (necesitaCupo) {
          await updateOrgDb(org.id, { cupo: cupoActual + 1 });
        }
        await insertBranchDb(org.id, data);
        await refreshOrganizations();
        setCupoError(false);
        setNuevaSuc("");
        toast(
          necesitaCupo
            ? "Cupo +1 y sucursal agregada"
            : t("toast.sucAgregada"),
          "success",
        );
        onClose();
      } finally {
        setBusy(false);
      }
      return;
    }
    if (necesitaCupo) {
      actualizarOrg(org.id, { cupo: cupoActual + 1 });
    }
    const res = createBranch(org.id, data);
    if (!res.ok) {
      setCupoError(true);
      return;
    }
    setCupoError(false);
    setNuevaSuc("");
    toast(
      necesitaCupo ? "Cupo +1 y sucursal agregada" : t("toast.sucAgregada"),
      "success",
    );
    onClose();
  };

  /** Sube el cupo en 1 sin salir del detalle. */
  const sumarCupo = async () => {
    if (!vista || busy) return;
    setBusy(true);
    try {
      const next = vista.cupo + 1;
      if (live) {
        await updateOrgDb(vista.id, { cupo: next });
        await refreshOrganizations();
      } else {
        actualizarOrg(vista.id, { cupo: next });
      }
      setCupo(next);
      setCupoError(false);
      toast(`Cupo actualizado: ${next}`, "success");
    } finally {
      setBusy(false);
    }
  };

  const togglePagado = async () => {
    if (!vista || busy) return;
    const next = !vista.pagado;
    const prox = next ? sumarCicloCobro(vista.plan) : new Date();
    const proximoCobroEn = prox ? prox.toISOString() : null;
    setBusy(true);
    try {
      if (live) {
        await updateOrgDb(vista.id, {
          pagado: next,
          proximoCobroEn,
        });
        await refreshOrganizations();
      } else {
        toggleOrgPagado(vista.id);
      }
      toast(next ? t("toast.orgPagado") : t("toast.orgImpago"), "info");
    } finally {
      setBusy(false);
    }
  };

  const toggleActivo = async () => {
    if (!vista || busy) return;
    const next = !vista.activo;
    // Override: se puede activar sin aceptación, pero con confirmación.
    if (
      next &&
      pendienteContrato(vista) &&
      !window.confirm(
        "El cliente todavía no aceptó las condiciones. ¿Activar la cuenta de todas formas?",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      if (live) {
        await updateOrgDb(vista.id, { activo: next });
        await refreshOrganizations();
      } else {
        toggleOrgActivo(vista.id);
      }
      toast(next ? t("toast.orgActiva") : t("toast.orgPausada"), "info");
    } finally {
      setBusy(false);
    }
  };

  const borrarSuc = async (sucId: string) => {
    if (!vista) return;
    if (live) {
      await deleteBranchDb(sucId);
      await refreshOrganizations();
    } else {
      removeBranch(vista.id, sucId);
    }
    toast(t("toast.sucBorrada"), "info");
  };

  const borrarOrg = async () => {
    if (!vista) return;
    if (live) {
      await eliminarOrganizacion(vista.id);
      await refreshOrganizations();
    } else {
      quitarOrg(vista.id);
    }
    toast(t("toast.orgBorrada"), "info");
    onClose();
  };

  const darMes = async () => {
    if (!vista || busy) return;
    setBusy(true);
    try {
      if (live) {
        const base = enGracia(vista)
          ? new Date(vista.mesGratisHasta as string)
          : new Date();
        base.setMonth(base.getMonth() + 1);
        const iso = base.toISOString();
        await updateOrgDb(vista.id, {
          mesGratisHasta: iso,
          proximoCobroEn: iso,
        });
        await refreshOrganizations();
      } else {
        giveFreeMonth(vista.id, 1);
      }
      toast(t("toast.mesGratis"), "success");
    } finally {
      setBusy(false);
    }
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

  const footerEdicion = editing ? (
    confirmDiscard ? (
      <div className="flex flex-col gap-2.5">
        <p className="text-center text-sm font-semibold text-carbon">
          ¿Salir sin guardar los cambios?
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setConfirmDiscard(false)}
            className="w-full rounded-full border border-linea bg-surface py-3 text-sm font-semibold text-carbon transition hover:bg-carbon/5 sm:flex-1"
          >
            Seguir editando
          </button>
          <button
            type="button"
            onClick={descartarYSalir}
            className="w-full rounded-full bg-red-500 py-3 text-sm font-semibold text-white transition hover:bg-red-600 sm:flex-1"
          >
            Salir sin guardar
          </button>
        </div>
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        {dirty ? (
          <p className="text-center text-[11px] font-semibold text-marca">
            Hay cambios sin guardar
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={intentarSalirForm}
            disabled={saving}
            className="w-full rounded-full border border-linea bg-crema/60 px-4 py-3 text-sm font-semibold text-carbon transition hover:bg-carbon/5 disabled:opacity-50 sm:flex-1"
          >
            {t("super.cancelar")}
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={saving || (mode === "editar" && !dirty)}
            className="w-full rounded-full bg-marca px-4 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte disabled:opacity-50 sm:flex-1"
          >
            {saving ? "Guardando…" : t("super.guardar")}
          </button>
        </div>
      </div>
    )
  ) : undefined;

  const footerEliminar =
    !editing && confirmDel ? (
      <div className="flex flex-col gap-2.5">
        <p className="text-center text-sm font-semibold text-carbon">
          ¿Eliminar esta empresa? No se puede deshacer.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setConfirmDel(false)}
            disabled={busy}
            className="w-full rounded-full border border-linea bg-surface py-3 text-sm font-semibold text-carbon transition hover:bg-carbon/5 disabled:opacity-50 sm:flex-1"
          >
            {t("super.cancelar")}
          </button>
          <button
            type="button"
            onClick={() => void borrarOrg()}
            disabled={busy}
            className="w-full rounded-full bg-red-500 py-3 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50 sm:flex-1"
          >
            {t("super.confirmarEliminar")}
          </button>
        </div>
      </div>
    ) : undefined;

  return (
    <ModalShell
      onClose={editing ? intentarSalirForm : onClose}
      labelledBy="org-modal-title"
      busy={saving || busy}
      footer={footerEdicion ?? footerEliminar}
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
          onClick={editing ? intentarSalirForm : onClose}
          disabled={saving || busy}
          className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/60 disabled:opacity-50"
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
          <Campo label={t("super.telefono")} error={errors.telefono}>
            <input
              className={INPUT}
              type="tel"
              inputMode="tel"
              placeholder="+54 9 11 5555 5555"
              value={phone}
              onChange={(e) => setTelefono(e.target.value)}
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
            {mode === "crear" ? (
              <Campo label={t("super.cupo")} error={errors.cupo}>
                <input
                  className={INPUT}
                  type="number"
                  min={1}
                  value={quota}
                  onChange={(e) => setCupo(parseInt(e.target.value, 10) || 1)}
                />
              </Campo>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-carbon/70">
                  {t("super.cupo")}
                </span>
                <p className="rounded-xl border border-linea bg-crema/40 px-4 py-3 text-sm text-carbon/55">
                  {org?.sucursales.length ?? 0} / {org?.cupo ?? quota} · se
                  gestiona abajo, en Sucursales
                </p>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-linea bg-crema/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-carbon/45">
              Plan / ciclo de cobro
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {(["mensual", "anual", "gratis"] as PlanTipo[]).map((p) => {
                const activo = plan === p;
                const cupoPreview =
                  mode === "editar" ? (org?.cupo ?? quota) : quota;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlan(p)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${
                      activo
                        ? "border-marca bg-marca/10 ring-2 ring-marca/20"
                        : "border-linea bg-surface hover:bg-carbon/5"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-carbon">
                        {p === "anual"
                          ? "Anual (2 meses gratis)"
                          : p === "gratis"
                            ? "Gratis (cortesía)"
                            : "Mensual"}
                      </span>
                      <span className="text-xs font-semibold text-marca">
                        {money.format(montoPlanPreview(p, cupoPreview))}
                        {p === "anual" ? "/año" : p === "mensual" ? "/mes" : ""}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-carbon/55">
                      {PLAN_HELP[p]}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-carbon/50">
              {plan === "anual"
                ? `Al guardar: cobrás ${money.format(montoPlanPreview(plan, mode === "editar" ? (org?.cupo ?? quota) : quota))} una vez al año.`
                : plan === "mensual"
                  ? `Al guardar: cobrás ${money.format(montoPlanPreview(plan, mode === "editar" ? (org?.cupo ?? quota) : quota))} cada mes.`
                  : "Al guardar: sin cobro recurrente."}
            </p>
          </div>
          <Campo label={t("super.direccion")}>
            <input
              className={INPUT}
              value={address}
              onChange={(e) => setDireccion(e.target.value)}
            />
          </Campo>
        </div>
      ) : vista ? (
        <div className="mt-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Dato label={t("super.responsable")} value={vista.responsable} />
            <Dato
              label={t("super.telefono")}
              value={vista.telefono || "—"}
            />
            <Dato label={t("super.emailDueno")} value={vista.duenoEmail} />
            <Dato label={t("super.cuil")} value={vista.cuil || "—"} />
            <Dato
              label={t("super.direccion")}
              value={vista.direccion || "—"}
            />
          </div>

          {/* Bloque de cobro: lo más importante para el superadmin */}
          <div className="rounded-2xl border border-linea bg-crema/50 p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-carbon/45">
                  Cobro
                </p>
                <p className="mt-1 font-display text-xl uppercase tracking-tight text-carbon">
                  {PLAN_LABEL[vista.plan]}
                  {vista.plan !== "gratis" && (
                    <span className="ml-2 font-sans text-sm font-semibold normal-case tracking-normal text-marca">
                      {money.format(
                        enGracia(vista)
                          ? montoPlanPreview(vista.plan, vista.cupo)
                          : cobroProximo(vista) || montoMensual(vista),
                      )}
                      {vista.plan === "anual" ? "/año" : "/mes"}
                    </span>
                  )}
                </p>
                <p className="mt-1 max-w-sm text-xs leading-snug text-carbon/55">
                  {textoProximoCobro(vista)}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                  pendienteContrato(vista) && !vista.activo
                    ? "bg-amber-100 text-amber-800"
                    : !vista.activo
                      ? "bg-carbon/10 text-carbon/55"
                      : enGracia(vista)
                        ? "bg-sky-100 text-sky-800"
                        : vista.pagado
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-600"
                }`}
              >
                {pendienteContrato(vista) && !vista.activo
                  ? "Esperando condiciones"
                  : !vista.activo
                    ? vista.contratoAceptadoEn
                      ? "Lista para activar"
                      : "Pausada"
                    : enGracia(vista)
                      ? "En prueba"
                      : vista.pagado
                        ? "Pagado"
                        : "Impago"}
              </span>
            </div>

            {pendienteContrato(vista) && (
              <p className="mt-3 rounded-xl border border-amber-300/80 bg-amber-100 px-3 py-2 text-xs font-medium text-amber-950">
                Esperando que el cliente acepte las condiciones.
                {!vista.activo
                  ? " La cuenta queda bloqueada hasta que acepte, o hasta que la actives vos acá (eligiendo el plan)."
                  : " Ya está activa (override manual)."}
              </p>
            )}

            {!pendienteContrato(vista) && !vista.activo && (
              <p className="mt-3 rounded-xl border border-emerald-300/80 bg-emerald-100 px-3 py-2 text-xs font-medium text-emerald-950">
                Condiciones aceptadas
                {vista.contratoAceptadoEn
                  ? ` el ${fechaCorta(vista.contratoAceptadoEn)}`
                  : ""}
                . Podés activar la cuenta cuando quieras.
              </p>
            )}

            {enGracia(vista) && vista.mesGratisHasta && (
              <p className="mt-3 rounded-xl border border-sky-300/80 bg-sky-100 px-3 py-2 text-xs font-medium text-sky-950">
                Mes gratis / cortesía hasta el{" "}
                <b>{fechaCorta(vista.mesGratisHasta)}</b>. El plan{" "}
                {PLAN_LABEL[vista.plan].toLowerCase()} ya está cargado; el cobro
                arranca cuando termine la prueba.
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void togglePagado()}
                disabled={busy || vista.plan === "gratis" || enGracia(vista)}
                title={
                  enGracia(vista)
                    ? "Durante la cortesía no hay cobro"
                    : vista.plan === "gratis"
                      ? "Plan gratis: no aplica"
                      : undefined
                }
                className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                  vista.pagado
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-600"
                }`}
              >
                {vista.pagado ? "Marcar impago" : "Marcar pagado"}
              </button>
              <button
                type="button"
                onClick={() => void mandarContrato()}
                disabled={busy}
                className="rounded-full bg-marca/10 px-3 py-1.5 text-xs font-semibold text-marca disabled:opacity-50"
              >
                Enviar condiciones + pago
              </button>
              <button
                type="button"
                onClick={() => void darMes()}
                disabled={busy}
                className="rounded-full bg-marca/10 px-3 py-1.5 text-xs font-semibold text-marca disabled:opacity-50"
              >
                + Mes gratis
              </button>
              <button
                type="button"
                onClick={() => void toggleActivo()}
                disabled={busy}
                className="rounded-full bg-carbon/8 px-3 py-1.5 text-xs font-semibold text-carbon/70 disabled:opacity-50"
              >
                {vista.activo ? t("super.pausar") : t("super.activar")}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (vista) entrarEditar(vista);
                }}
                className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/70"
              >
                Editar datos / plan
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-linea bg-crema/40 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-carbon/45">
                  {t("super.sucursales")}
                </p>
                <p className="mt-1 text-sm text-carbon/70">
                  <b>{vista.sucursales.length}</b> de <b>{vista.cupo}</b>{" "}
                  contratadas
                  {vista.sucursales.length >= vista.cupo
                    ? " · cupo completo"
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void sumarCupo()}
                disabled={busy}
                className="shrink-0 rounded-full border border-linea bg-surface px-3 py-1.5 text-xs font-semibold text-carbon/70 transition hover:bg-carbon/5 disabled:opacity-50"
              >
                +1 cupo
              </button>
            </div>

            <ul className="mt-3 flex flex-col gap-2">
              {vista.sucursales.map((suc) => (
                <li
                  key={suc.id}
                  className="flex flex-col gap-2 rounded-2xl border border-linea bg-surface px-3 py-3 sm:flex-row sm:items-center"
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
                      onClick={() => {
                        const next = !suc.activo;
                        toggleBranchActive(vista.id, suc.id);
                        toast(
                          next ? t("toast.sucActiva") : t("toast.sucPausada"),
                          "info",
                        );
                      }}
                      className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/60"
                    >
                      {suc.activo ? t("super.pausar") : t("super.activar")}
                    </button>
                    <button
                      type="button"
                      onClick={() => borrarSuc(suc.id)}
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

            <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-dashed border-linea bg-surface/80 p-3">
              <p className="text-xs font-semibold text-carbon/55">
                Agregar sucursal
                {vista.sucursales.length >= vista.cupo
                  ? " (incluye +1 cupo)"
                  : ""}
              </p>
              {quotaError && (
                <p className="text-xs text-red-500">{t("super.cupoLleno")}</p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className={INPUT}
                  placeholder={t("super.nombreSucursal")}
                  value={newBranch}
                  onChange={(e) => {
                    setNuevaSuc(e.target.value);
                    setCupoError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void agregarSuc();
                    }
                  }}
                />
                <Select
                  value={nuevaTipo}
                  onChange={(v) => setNuevaTipo(v as TipoNegocio)}
                  options={(Object.keys(TIPO_LABEL) as TipoNegocio[]).map(
                    (k) => ({ value: k, label: TIPO_LABEL[k] }),
                  )}
                  className="sm:min-w-[9.5rem]"
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setNuevaSuc("");
                    setCupoError(false);
                  }}
                  disabled={busy || !newBranch.trim()}
                  className="w-full rounded-full border border-linea px-4 py-2.5 text-sm font-semibold text-carbon transition hover:bg-carbon/5 disabled:opacity-40 sm:flex-1"
                >
                  {t("super.cancelar")}
                </button>
                <button
                  type="button"
                  onClick={() => void agregarSuc()}
                  disabled={busy || !newBranch.trim()}
                  className="w-full rounded-full bg-marca px-4 py-2.5 text-sm font-semibold text-crema disabled:opacity-50 sm:flex-1"
                >
                  {busy
                    ? "…"
                    : vista.sucursales.length >= vista.cupo
                      ? "Guardar (+1 cupo)"
                      : "Guardar sucursal"}
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setConfirmDel(true)}
            className="text-xs font-semibold text-red-600/70 hover:text-red-600"
          >
            {t("super.eliminar")}
          </button>
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

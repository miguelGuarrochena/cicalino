"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { useApp } from "@/components/providers/Providers";
import {
  useSuperadminStore,
  upcomingCharge,
  monthlyAmount,
  enGracia,
  isContractPending,
  monthlyPriceForBranch,
  type OrganizationRow,
  type OrgInput,
  type PlanTipo,
} from "@/lib/store/superadmin-store";
import {
  PRICE_ORDERS,
  PRICE_WAITLIST,
  PRICE_BUNDLE,
} from "@/lib/pricing";
import { addBillingCycle } from "@/lib/billing";
import type { BusinessType } from "@/lib/store/config-store";
import { BUSINESS_TYPE_LABEL, BUSINESS_TYPES } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { isEmail, isCuil, isWhatsapp, formatCuil } from "@/lib/validations";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { supabaseConfigured } from "@/lib/supabase/config";
import {
  createOrganization,
  deleteOrg,
  activateOrg,
} from "@/lib/actions/superadmin";
import {
  refreshOrganizations,
  updateOrgDb,
} from "@/lib/data/superadmin";
import { sendContractLink, getContractLink } from "@/lib/actions/contract";

const required = (v: string) => v.trim().length > 0;
const emailOk = isEmail;
const cuilOk = (v: string) => !v.trim() || isCuil(v);

type DraftOrg = {
  name: string;
  responsable: string;
  telefono: string;
  cuil: string;
  direccion: string;
  ownerEmail: string;
  cupo: number;
  plan: PlanTipo;
};

const draftVacio = (): DraftOrg => ({
  name: "",
  responsable: "",
  telefono: "",
  cuil: "",
  direccion: "",
  ownerEmail: "",
  cupo: 1,
  plan: "mensual",
});

const draftDesdeOrg = (o: OrganizationRow): DraftOrg => ({
  name: o.name,
  responsable: o.responsable,
  telefono: o.telefono,
  cuil: o.cuil,
  direccion: o.direccion,
  ownerEmail: o.ownerEmail,
  cupo: o.cupo,
  plan: o.plan,
});

const draftsIguales = (a: DraftOrg, b: DraftOrg): boolean =>
  a.name.trim() === b.name.trim() &&
  a.responsable.trim() === b.responsable.trim() &&
  a.telefono.trim() === b.telefono.trim() &&
  a.cuil.trim() === b.cuil.trim() &&
  a.direccion.trim() === b.direccion.trim() &&
  a.ownerEmail.trim() === b.ownerEmail.trim() &&
  a.cupo === b.cupo &&
  a.plan === b.plan;

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const TIPO_LABEL = BUSINESS_TYPE_LABEL;

const PLAN_LABEL: Record<PlanTipo, string> = {
  mensual: "Mensual",
  anual: "Anual",
  gratis: "Gratis",
};

const PLAN_HELP: Record<PlanTipo, string> = {
  mensual: "Cobro cada mes = suma de lo contratado en cada sucursal.",
  anual: "Un solo cobro por año (precio de 10 meses: 2 de regalo).",
  gratis: "Sin cobro. Cortesía permanente, no es el mes de prueba.",
};

const fechaCorta = (iso: string): string =>
  new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const textoProximoCobro = (org: OrganizationRow): string => {
  if (isContractPending(org) && !org.activo) {
    return "Esperando que el cliente acepte las condiciones.";
  }
  if (org.plan === "gratis") return "Sin próximo cobro (plan gratis).";
  if (enGracia(org) && org.freeMonthUntil) {
    const ciclo = org.plan === "anual" ? "anual" : "mensual";
    return `Cortesía hasta el ${fechaCorta(org.freeMonthUntil)}. Después empieza el ciclo ${ciclo}.`;
  }
  if (!org.activo) return "Cuenta pausada: no se cobra.";
  if (org.nextChargeAt) {
    const fecha = fechaCorta(org.nextChargeAt);
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

const montoPlanPreview = (
  plan: PlanTipo,
  cupo: number,
  modulos: { pedidos: boolean; espera: boolean } = {
    pedidos: true,
    espera: false,
  },
): number => {
  if (plan === "gratis") return 0;
  const mes = cupo * monthlyPriceForBranch(modulos);
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
    darMesGratis: giveFreeMonth,
  } = useSuperadminStore();
  const enterAsOwner = useSessionStore((s) => s.entrarComoDueño);
  const live = supabaseConfigured;

  const [mode, setMode] = useState<Mode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Trabajando…");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const editing = mode === "crear" || mode === "editar";

  const conBusy = async (label: string, fn: () => Promise<void>) => {
    setBusyLabel(label);
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const [name, setName] = useState(org?.name ?? "");
  const [manager, setResponsable] = useState(org?.responsable ?? "");
  const [phone, setTelefono] = useState(org?.telefono ?? "");
  const [cuil, setCuil] = useState(org?.cuil ?? "");
  const [address, setDireccion] = useState(org?.direccion ?? "");
  const [ownerEmail, setOwnerEmail] = useState(org?.ownerEmail ?? "");
  const [quota, setCupo] = useState(org?.cupo ?? 1);
  const [plan, setPlan] = useState<PlanTipo>(org?.plan ?? "mensual");
  const [baseline, setBaseline] = useState<DraftOrg>(() =>
    initialMode === "crear" || !org ? draftVacio() : draftDesdeOrg(org),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = useState(false);

  const [crearPrimera, setCrearPrimera] = useState(true);
  const [primeraNombre, setPrimeraNombre] = useState("");
  const [primeraTipo, setPrimeraTipo] = useState<BusinessType>("cafeteria");

  const draftActual = (): DraftOrg => ({
    name: name,
    responsable: manager,
    telefono: phone,
    cuil,
    direccion: address,
    ownerEmail: ownerEmail,
    cupo: quota,
    plan,
  });

  const dirty = editing && !draftsIguales(draftActual(), baseline);

  const aplicarDraft = (d: DraftOrg) => {
    setName(d.name);
    setResponsable(d.responsable);
    setTelefono(d.telefono);
    setCuil(d.cuil);
    setDireccion(d.direccion);
    setOwnerEmail(d.ownerEmail);
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

  const copiarLinkContrato = async (destino: "copiar" | "whatsapp") => {
    if (!vista || busy) return;
    const r = await getContractLink(vista.id);
    if (!r.ok || !r.url) {
      toast(r.ok ? "No se pudo generar el link" : r.error, "error");
      return;
    }
    if (destino === "whatsapp") {
      const texto = `Hola${vista.responsable ? ` ${vista.responsable}` : ""}, te paso las condiciones de Cicalino para ${vista.name}: ${r.url}`;
      const tel = vista.telefono.replace(/\D/g, "");
      window.open(
        `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`,
        "_blank",
        "noopener",
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(r.url);
      toast("Link copiado", "success");
    } catch {
      window.prompt("Copiá el link de condiciones:", r.url);
    }
  };

  const mandarContrato = async () => {
    if (!vista || busy) return;
    await conBusy("Enviando condiciones…", async () => {
      const r = await sendContractLink(vista.id);
      if (!r.ok) {
        toast(r.error, "error");
        return;
      }
      if (r.url) {
        try {
          await navigator.clipboard.writeText(r.url);
        } catch {
        }
      }
      toast("Link de condiciones enviado (y copiado)", "success");
    });
  };
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!required(name)) e.name = t("super.errNombre");
    if (!required(manager)) e.responsable = t("super.errResponsable");
    if (!required(phone) || !isWhatsapp(phone))
      e.telefono = t("super.errTelefono");
    if (!emailOk(ownerEmail)) e.ownerEmail = t("super.errEmail");
    if (cuil && !cuilOk(cuil)) e.cuil = t("super.errCuil");
    if (quota < 1) e.cupo = t("super.errCupo");
    if (org && quota < org.sucursales.length) e.cupo = t("super.errCupoBajo");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const guardar = async () => {
    if (!validate()) return;
    const data: OrgInput = {
      name: name,
      responsable: manager,
      telefono: phone,
      cuil,
      direccion: address,
      ownerEmail: ownerEmail,
      cupo: quota,
      plan,
    };
    if (mode === "crear") {
      if (live) {
        setSaving(true);
        const res = await createOrganization({
          ...data,
          sucursales: crearPrimera
            ? [
                {
                  name: (primeraNombre.trim() || name).slice(0, 80),
                  tipo: primeraTipo,
                  direccion: address,
                  moduloPedidos: true,
                  moduloEspera: false,
                },
              ]
            : [],
        });
        setSaving(false);
        if (!res.ok) {
          setErrors((e) => ({ ...e, name: res.error }));
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

  const togglePagado = async () => {
    if (!vista || busy) return;
    const next = !vista.pagado;
    let nextChargeAt: string | null;
    if (!next) {
      nextChargeAt = new Date().toISOString();
    } else if (
      vista.plan === "anual" &&
      vista.nextChargeAt &&
      new Date(vista.nextChargeAt).getTime() > Date.now()
    ) {
      nextChargeAt = vista.nextChargeAt;
    } else {
      const prox = addBillingCycle(vista.plan);
      nextChargeAt = prox ? prox.toISOString() : null;
    }
    await conBusy(next ? "Marcando pagado…" : "Marcando impago…", async () => {
      if (live) {
        toggleOrgPagado(vista.id);
        await updateOrgDb(vista.id, {
          pagado: next,
          nextChargeAt,
        });
        await refreshOrganizations();
      } else {
        toggleOrgPagado(vista.id);
      }
      toast(next ? t("toast.orgPagado") : t("toast.orgImpago"), "info");
    });
  };

  const toggleActivo = async () => {
    if (!vista || busy) return;
    const next = !vista.activo;
    if (
      next &&
      isContractPending(vista) &&
      !window.confirm(
        "El cliente todavía no aceptó las condiciones. ¿Activar la cuenta de todas formas?",
      )
    ) {
      return;
    }
    await conBusy(
      next ? "Activando e invitando…" : "Pausando cuenta…",
      async () => {
        if (live) {
          if (next) {
            const r = await activateOrg(vista.id);
            if (!r.ok) {
              await refreshOrganizations();
              toast(r.error, "error");
              return;
            }
            toggleOrgActivo(vista.id);
            toast("Cuenta activada · invitación de alta enviada", "success");
            await refreshOrganizations();
          } else {
            toggleOrgActivo(vista.id);
            await updateOrgDb(vista.id, { activo: false });
            toast(t("toast.orgPausada"), "info");
            await refreshOrganizations();
          }
        } else {
          toggleOrgActivo(vista.id);
          toast(next ? t("toast.orgActiva") : t("toast.orgPausada"), "info");
        }
      },
    );
  };

  const borrarOrg = async () => {
    if (!vista || busy) return;
    const id = vista.id;
    await conBusy("Eliminando empresa…", async () => {
      if (live) {
        const r = await deleteOrg(id);
        if (!r.ok) {
          toast(r.error, "error");
          return;
        }
        quitarOrg(id);
        toast(t("toast.orgBorrada"), "info");
        onClose();
        await refreshOrganizations();
        return;
      }
      quitarOrg(id);
      toast(t("toast.orgBorrada"), "info");
      onClose();
    });
  };

  const darMes = async () => {
    if (!vista || busy) return;
    await conBusy("Otorgando mes gratis…", async () => {
      if (live) {
        giveFreeMonth(vista.id, 1);
        const base = enGracia(vista)
          ? new Date(vista.freeMonthUntil as string)
          : new Date();
        base.setMonth(base.getMonth() + 1);
        const iso = base.toISOString();
        await updateOrgDb(vista.id, {
          freeMonthUntil: iso,
          nextChargeAt: iso,
        });
        await refreshOrganizations();
      } else {
        giveFreeMonth(vista.id, 1);
      }
      toast(t("toast.mesGratis"), "success");
    });
  };

  const enterOwner = (branchId: string, branchNameLabel: string) => {
    if (!org) return;
    enterAsOwner({
      organizationId: org.id,
      organizationName: org.name,
      sucursalId: branchId,
      branchName: branchNameLabel,
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
            onClick={() => void guardar()}
            disabled={saving || (mode === "editar" && !dirty)}
            className="w-full rounded-full bg-marca px-4 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte disabled:opacity-50 sm:flex-1"
          >
            {saving ? "Guardando…" : t("super.guardar")}
          </button>
          <button
            type="button"
            onClick={intentarSalirForm}
            disabled={saving}
            className="w-full rounded-full border border-linea bg-crema/60 px-4 py-3 text-sm font-semibold text-carbon transition hover:bg-carbon/5 disabled:opacity-50 sm:flex-1"
          >
            {t("super.cancelar")}
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
      busyLabel={saving ? "Guardando…" : busyLabel}
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
            {mode === "crear" ? t("super.nuevaOrg") : vista?.name}
          </h2>
        </div>
        <ModalCloseBtn
          onClick={editing ? intentarSalirForm : onClose}
          disabled={saving || busy}
          label={t("qr.cerrar")}
        />
      </div>

      {editing ? (
        <div className="mt-5 flex flex-col gap-3">
          <Campo label={t("super.nombreOrg")} error={errors.name}>
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
          <Campo label={t("super.emailDueno")} error={errors.ownerEmail}>
            <input
              className={INPUT}
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
            />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo
              label={t("super.cuil")}
              error={
                errors.cuil ??
                (cuil.replace(/\D/g, "").length > 0 && !cuilOk(cuil)
                  ? `Faltan ${11 - cuil.replace(/\D/g, "").length} dígitos`
                  : null)
              }
            >
              <input
                className={INPUT}
                value={cuil}
                inputMode="numeric"
                autoComplete="off"
                placeholder="20-12345678-3"
                onChange={(e) => setCuil(formatCuil(e.target.value))}
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
                  {org?.sucursales.length ?? 0} sucursales · se gestionan en el
                  detalle
                </p>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-linea bg-crema/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-carbon/45">
              Módulos por sucursal
            </p>
            <p className="mt-1 text-sm text-carbon/60">
              Cada local tiene su pack (Pedidos {money.format(PRICE_ORDERS)} ·
              Espera {money.format(PRICE_WAITLIST)} · Pack{" "}
              {money.format(PRICE_BUNDLE)}). El cobro es la suma de las
              sucursales.
            </p>
            {mode === "crear" && (
              <div className="mt-3 rounded-xl border border-linea bg-surface p-3">
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={crearPrimera}
                    onChange={(e) => setCrearPrimera(e.target.checked)}
                    className="mt-0.5 size-4 accent-[var(--marca,#1E22B4)]"
                  />
                  <span className="text-sm text-carbon/75">
                    Crear la primera sucursal ahora
                    <span className="block text-xs text-carbon/50">
                      El dueño entra y su local ya está listo. Queda gratis hasta
                      la primera factura.
                    </span>
                  </span>
                </label>
                {crearPrimera && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      className={INPUT}
                      value={primeraNombre}
                      onChange={(e) => setPrimeraNombre(e.target.value)}
                      placeholder={name.trim() || "Nombre de la sucursal"}
                    />
                    <Select
                      value={primeraTipo}
                      onChange={(v) => setPrimeraTipo(v as BusinessType)}
                      options={BUSINESS_TYPES.map((k) => ({
                        value: k,
                        label: TIPO_LABEL[k],
                      }))}
                      className="sm:min-w-[11rem]"
                    />
                  </div>
                )}
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
                      {p !== "gratis" && (
                        <span className="text-xs font-semibold text-marca">
                          desde{" "}
                          {money.format(
                            p === "anual" ? PRICE_WAITLIST * 10 : PRICE_WAITLIST,
                          )}
                          /suc. {p === "anual" ? "por año" : "por mes"}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-carbon/55">
                      {PLAN_HELP[p]}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-carbon/50">
              {plan === "gratis"
                ? "Al guardar: sin cobro recurrente."
                : "El monto se arma con los packs de cada sucursal (detalle)."}
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
            <Dato label={t("super.emailDueno")} value={vista.ownerEmail} />
            <Dato label={t("super.cuil")} value={vista.cuil || "—"} />
            <Dato
              label={t("super.direccion")}
              value={vista.direccion || "—"}
            />
          </div>

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
                          ? monthlyAmount(vista) *
                              (vista.plan === "anual" ? 10 : 1)
                          : upcomingCharge(vista) || monthlyAmount(vista),
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
                  isContractPending(vista) && !vista.activo
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
                {isContractPending(vista) && !vista.activo
                  ? "Esperando condiciones"
                  : !vista.activo
                    ? vista.contractAcceptedAt
                      ? "Lista para activar"
                      : "Pausada"
                    : enGracia(vista)
                      ? "En prueba"
                      : vista.pagado
                        ? "Pagado"
                        : "Impago"}
              </span>
            </div>

            {isContractPending(vista) && (
              <p className="mt-3 rounded-xl border border-amber-300/80 bg-amber-100 px-3 py-2 text-xs font-medium text-amber-950">
                Esperando que el cliente acepte las condiciones.
                {!vista.activo
                  ? " La cuenta queda bloqueada hasta que acepte, o hasta que la actives vos acá (eligiendo el plan)."
                  : " Ya está activa (override manual)."}
              </p>
            )}

            {!isContractPending(vista) && !vista.activo && (
              <p className="mt-3 rounded-xl border border-emerald-300/80 bg-emerald-100 px-3 py-2 text-xs font-medium text-emerald-950">
                Condiciones aceptadas
                {vista.contractAcceptedAt
                  ? ` el ${fechaCorta(vista.contractAcceptedAt)}`
                  : ""}
                . Podés activar la cuenta cuando quieras.
              </p>
            )}

            {enGracia(vista) && vista.freeMonthUntil && (
              <p className="mt-3 rounded-xl border border-sky-300/80 bg-sky-100 px-3 py-2 text-xs font-medium text-sky-950">
                Mes gratis / cortesía hasta el{" "}
                <b>{fechaCorta(vista.freeMonthUntil)}</b>. El plan{" "}
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
                onClick={() => void copiarLinkContrato("copiar")}
                disabled={busy}
                className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/70 disabled:opacity-50"
              >
                Copiar link
              </button>
              {vista.telefono.replace(/\D/g, "").length >= 8 && (
                <button
                  type="button"
                  onClick={() => void copiarLinkContrato("whatsapp")}
                  disabled={busy}
                  className="rounded-full bg-emerald-600/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                >
                  Mandar por WhatsApp
                </button>
              )}
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

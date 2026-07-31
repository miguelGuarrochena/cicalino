"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { PackPicker } from "@/components/admin/PackPicker";
import { useSessionStore } from "@/lib/store/session-store";
import type { OrganizationRow } from "@/lib/store/superadmin-store";
import { monthlyPriceForBranch } from "@/lib/pricing";
import {
  BUSINESS_TYPE_LABEL,
  BUSINESS_TYPES,
  type BusinessType,
} from "@/lib/store/config-store";
import {
  deleteBranchDb,
  insertBranchDb,
  refreshOrganizations,
  fetchOrgUsers,
  setBranchActiveDb,
  setBranchBillingStartDb,
  setBranchManagerDb,
  updateBranchModulesDb,
  type OrgUser,
} from "@/lib/data/superadmin";
import { addCycle, toDateOnly } from "@/lib/subscription";
import { TOUCH_BTN, TOUCH_ROW } from "@/lib/ui/touch";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const fecha = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-3 py-2.5 text-sm text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20";

export const BranchesSection = ({ org }: { org: OrganizationRow }) => {
  const toast = useToast();
  const router = useRouter();
  const enterAsOwner = useSessionStore((s) => s.entrarComoDueño);

  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoTipo, setNuevoTipo] = useState<BusinessType>("cafeteria");
  const [nuevoPedidos, setNuevoPedidos] = useState(true);
  const [nuevoEspera, setNuevoEspera] = useState(false);
  const [creando, setCreando] = useState(false);
  const [usuarios, setUsuarios] = useState<OrgUser[]>([]);

  useEffect(() => {
    let alive = true;
    void fetchOrgUsers(org.id).then((u) => {
      if (alive) setUsuarios(u);
    });
    return () => {
      alive = false;
    };
  }, [org.id]);

  const hoy = toDateOnly(new Date());
  const gratis = org.plan === "gratis";

  const cambiarPack = async (
    branchId: string,
    pedidos: boolean,
    espera: boolean,
  ) => {
    setBusy(branchId);
    await updateBranchModulesDb(org.id, branchId, {
      moduloPedidos: pedidos,
      moduloEspera: espera,
    });
    await refreshOrganizations();
    setBusy(null);
    toast("Pack actualizado", "success");
  };

  const alternarActiva = async (branchId: string, activa: boolean) => {
    setBusy(branchId);
    await setBranchActiveDb(branchId, activa);
    await refreshOrganizations();
    setBusy(null);
    toast(activa ? "Sucursal reactivada" : "Sucursal dada de baja", "info");
  };

  const darMesGratis = async (branchId: string, desde: string | null) => {
    setBusy(branchId);
    const base = desde && desde > hoy ? desde : hoy;
    const nueva = addCycle(base, Number(base.slice(8, 10)));
    await setBranchBillingStartDb(branchId, nueva);
    await refreshOrganizations();
    setBusy(null);
    toast(`Gratis hasta el ${fecha(nueva)}`, "success");
  };

  const cambiarResponsable = async (branchId: string, usuarioId: string) => {
    setBusy(branchId);
    await setBranchManagerDb(branchId, usuarioId || null);
    await refreshOrganizations();
    setBusy(null);
    toast("Responsable actualizado", "success");
  };

  const eliminar = async (branchId: string) => {
    setBusy(branchId);
    await deleteBranchDb(branchId);
    await refreshOrganizations();
    setBusy(null);
    setConfirmDel(null);
    toast("Sucursal eliminada", "info");
  };

  const agregar = async () => {
    if (creando || !nuevoNombre.trim()) return;
    setCreando(true);
    await insertBranchDb(org.id, {
      name: nuevoNombre.trim(),
      tipo: nuevoTipo,
      direccion: "",
      moduloPedidos: nuevoPedidos,
      moduloEspera: nuevoEspera,
    });
    await refreshOrganizations();
    setCreando(false);
    setNuevoNombre("");
    toast("Sucursal creada", "success");
  };

  return (
    <section className="rounded-[24px] border border-linea bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-carbon/45">
          Sucursales
        </h2>
        <p className="text-xs text-carbon/50">
          {org.sucursales.filter((s) => s.activo).length} activas ·{" "}
          {org.sucursales.length} en total
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {org.sucursales.map((s) => {
          const aporta = monthlyPriceForBranch({
            pedidos: s.moduloPedidos,
            espera: s.moduloEspera,
          });
          const enGratis = Boolean(s.cobroDesde && s.cobroDesde > hoy);
          const deBaja = !s.activo;
          return (
            <div
              key={s.id}
              className={`rounded-2xl border px-4 py-3.5 ${
                deBaja
                  ? "border-dashed border-linea bg-crema/10"
                  : "border-linea bg-crema/30"
              } ${busy === s.id ? "opacity-50" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate font-semibold text-carbon">
                    {s.name}
                    {deBaja && (
                      <span className="rounded-full border border-linea bg-carbon/5 px-2 py-0.5 text-[11px] font-semibold text-carbon/55">
                        De baja
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-carbon/50">
                    {BUSINESS_TYPE_LABEL[s.tipo] ?? s.tipo}
                    {s.direccion ? ` · ${s.direccion}` : ""}
                    {s.altaEn ? ` · alta ${fecha(s.altaEn)}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`font-display text-base leading-tight ${deBaja ? "text-carbon/35 line-through" : "text-marca"}`}
                  >
                    {gratis ? "—" : money.format(aporta)}
                  </p>
                  <p className="text-[11px] text-carbon/45">
                    {gratis
                      ? "sin cargo"
                      : deBaja
                        ? "no se cobra"
                        : "aporta por mes"}
                  </p>
                </div>
              </div>

              {usuarios.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-carbon/50">Responsable</span>
                  <Select
                    value={s.responsableId ?? ""}
                    onChange={(v) => void cambiarResponsable(s.id, v)}
                    options={[
                      { value: "", label: "Sin asignar" },
                      ...usuarios.map((u) => ({
                        value: u.id,
                        label: u.nombre,
                      })),
                    ]}
                    className="min-w-[11rem]"
                  />
                </div>
              )}

              <div className="mt-3 sm:max-w-sm">
                <PackPicker
                  pedidos={s.moduloPedidos}
                  espera={s.moduloEspera}
                  compact
                  onChange={(p, e) => void cambiarPack(s.id, p, e)}
                />
              </div>

              <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <p className="text-xs text-carbon/55">
                  {enGratis ? (
                    <span className="text-amber-700">
                      Gratis hasta el {fecha(s.cobroDesde)} · entra al cobro ese
                      día
                    </span>
                  ) : (
                    <>Entró al cobro el {fecha(s.cobroDesde)}</>
                  )}
                </p>
                <div className={TOUCH_ROW}>
                  {!deBaja && !gratis && (
                    <button
                      type="button"
                      onClick={() => void darMesGratis(s.id, s.cobroDesde)}
                      className={`${TOUCH_BTN} rounded-full border border-marca/40 bg-marca/10 text-marca hover:bg-marca/20`}
                    >
                      + Mes gratis
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void alternarActiva(s.id, deBaja)}
                    className={`${TOUCH_BTN} rounded-full border border-linea text-carbon/70 hover:bg-carbon/5`}
                  >
                    {deBaja ? "Reactivar" : "Dar de baja"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      enterAsOwner({
                        organizationId: org.id,
                        organizationName: org.name,
                        sucursalId: s.id,
                        branchName: s.name,
                      });
                      router.push("/panel");
                    }}
                    className={`${TOUCH_BTN} rounded-full bg-marca text-crema hover:bg-marca-fuerte`}
                  >
                    Entrar como dueño
                  </button>
                  {confirmDel === s.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void eliminar(s.id)}
                        className={`${TOUCH_BTN} rounded-full bg-red-500 text-white`}
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDel(null)}
                        className={`${TOUCH_BTN} rounded-full border border-linea text-carbon/60`}
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDel(s.id)}
                      className={`${TOUCH_BTN} rounded-full text-red-600/80 hover:bg-red-500/10`}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {!org.sucursales.length && (
          <p className="rounded-2xl border border-dashed border-linea px-4 py-6 text-center text-sm text-carbon/45">
            Esta empresa todavía no tiene sucursales.
          </p>
        )}
      </div>

      <div className="mt-4 border-t border-linea pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/45">
          Agregar sucursal
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className={INPUT}
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nombre (ej. Centro)"
          />
          <Select
            value={nuevoTipo}
            onChange={(v) => setNuevoTipo(v as BusinessType)}
            options={BUSINESS_TYPES.map((k) => ({
              value: k,
              label: BUSINESS_TYPE_LABEL[k],
            }))}
            className="sm:min-w-[11rem]"
          />
          <button
            type="button"
            onClick={() => void agregar()}
            disabled={creando || !nuevoNombre.trim()}
            className="min-h-11 w-full rounded-full bg-marca px-5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte disabled:opacity-40 sm:w-auto"
          >
            {creando ? "…" : "Agregar"}
          </button>
        </div>
        <div className="mt-2 sm:max-w-sm">
          <PackPicker
            pedidos={nuevoPedidos}
            espera={nuevoEspera}
            onChange={(p, e) => {
              setNuevoPedidos(p);
              setNuevoEspera(e);
            }}
          />
        </div>
        <p className="mt-2 text-xs text-carbon/45">
          Queda gratis hasta {fecha(org.proximaFactura)}, la próxima factura del
          cliente.
        </p>
      </div>
    </section>
  );
};

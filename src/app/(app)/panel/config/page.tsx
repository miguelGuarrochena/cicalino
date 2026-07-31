"use client";

import { SubscriptionCard } from "@/components/panel/SubscriptionCard";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore } from "@/lib/store/session-store";
import { NoAccess } from "@/components/ui/NoAccess";
import { AdminGate } from "@/components/panel/AdminGate";
import { EmployeeList } from "@/components/panel/EmployeeList";
import {
  useConfigStore,
  type IdentificationMode,
} from "@/lib/store/config-store";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { saveBranchConfig } from "@/lib/data/branch";
import { syncTables } from "@/lib/data/waitlist";
import { PedirSucursalCard } from "@/components/panel/PedirSucursalCard";
import { HelpLink } from "@/components/panel/HelpLink";
import { supabaseConfigured } from "@/lib/supabase/config";
import { isRealBranchId } from "@/lib/data/orders";
import { BUSINESS_TYPE_LABEL } from "@/lib/types";
import {
  saveDeviceMode,
  readDeviceMode,
  type DeviceMode,
} from "@/lib/modules";

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 placeholder:text-carbon/40";
const CARD =
  "rounded-[24px] border border-linea bg-surface p-4 shadow-sm sm:p-6";

const HORAS_CORTE = Array.from({ length: 24 }).map((_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, "0")}:00`,
}));

const Campo = ({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) => {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-carbon/70">{label}</span>
      {children}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </label>
  );
};

type FormErrors = {
  mesas?: string;
};

const ConfigPage = () => {
  const { t } = useApp();
  const toast = useToast();
  const role = useSessionStore((s) => s.rol);
  const branchId = useSessionStore((s) => s.sucursalId);
  const c = useConfigStore();
  const [guardado, setGuardado] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [dispositivo, setDispositivo] = useState<DeviceMode>("ambos");

  useEffect(() => {
    setDispositivo(readDeviceMode());
  }, []);

  const modes: {
    id: IdentificationMode;
    label: string;
    det: string;
  }[] = [
    { id: "pedido", label: t("modo.pedido"), det: t("config.modoPedidoDet") },
    { id: "nombre", label: t("modo.nombre"), det: t("config.modoNombreDet") },
    { id: "mesa", label: t("modo.mesa"), det: t("config.modoMesaDet") },
  ];

  const validar = (): FormErrors => {
    const next: FormErrors = {};
    if (c.modo === "mesa" && (!c.tableCount || c.tableCount < 1)) {
      next.mesas = t("config.errMesas");
    }
    if (c.moduloEspera && (!c.tableCount || c.tableCount < 1)) {
      next.mesas = t("config.errMesas");
    }
    return next;
  };

  const guardar = async () => {
    if (saving) return;
    const next = validar();
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      if (supabaseConfigured && isRealBranchId(branchId)) {
        const ok = await saveBranchConfig(branchId, {
          modo: c.modo,
          tableCount: c.tableCount,
          cutoffHour: c.cutoffHour,
        });
        if (!ok) {
          toast(t("toast.configError"), "error");
          return;
        }
        if (c.moduloEspera || c.modo === "mesa") {
          await syncTables(branchId, c.tableCount);
        }
      }
      setGuardado(true);
      toast(t("toast.configGuardada"), "success");
      setTimeout(() => setGuardado(false), 2200);
    } catch {
      toast(t("toast.configError"), "error");
    } finally {
      setSaving(false);
    }
  };

  if (role === "empleado" || role === "superadmin") {
    return <NoAccess />;
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <SubscriptionCard />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
            {t("config.titulo")}
          </h1>
          <HelpLink seccion="config" />
        </div>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={saving}
          className="w-full rounded-full bg-marca px-5 py-3 text-sm font-semibold text-crema shadow-sm transition hover:bg-marca-fuerte active:scale-95 disabled:opacity-60 sm:w-auto"
        >
          {saving
            ? "…"
            : guardado
              ? `✓ ${t("config.guardado")}`
              : t("config.guardar")}
        </button>
      </div>

      {role === "admin" && (
        <section className={CARD}>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-carbon/60">
            {t("config.seccionLocal")}
          </h2>
          <p className="mb-4 text-sm text-carbon/55">
            Datos del local (solo el administrador de Cicalino los puede
            cambiar).
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-carbon/70">
                {t("config.nombre")}
              </span>
              <p className="rounded-xl border border-linea bg-crema/30 px-4 py-3 text-carbon">
                {c.name.trim() || "—"}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-carbon/70">
                {t("config.tipo")}
              </span>
              <p className="rounded-xl border border-linea bg-crema/30 px-4 py-3 text-carbon">
                {BUSINESS_TYPE_LABEL[c.tipo] ?? c.tipo}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-carbon/70">
                {t("config.whatsapp")}
              </span>
              <p className="rounded-xl border border-linea bg-crema/30 px-4 py-3 text-carbon">
                {c.whatsapp.trim() || "—"}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-carbon/70">
                {t("config.direccion")}
              </span>
              <p className="rounded-xl border border-linea bg-crema/30 px-4 py-3 text-carbon">
                {c.direccion.trim() || "—"}
              </p>
            </div>
          </div>
        </section>
      )}

      {role === "admin" && supabaseConfigured && isRealBranchId(branchId) && (
        <PedirSucursalCard />
      )}

      <section className={CARD}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-carbon/60">
          Módulos de esta sucursal
        </h2>
        <p className="mb-4 mt-1 text-sm text-carbon/55">
          Lo contratado para este local. Si necesitás sumar o quitar un módulo,
          pedilo al administrador.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div
            className={`rounded-2xl border p-4 ${
              c.moduloPedidos
                ? "border-marca bg-marca/10 ring-2 ring-marca/30"
                : "border-linea bg-crema/30 opacity-55"
            }`}
          >
            <span className="font-semibold text-carbon">Pedidos listos</span>
            <span className="mt-1 block text-xs text-carbon/55">
              {c.moduloPedidos
                ? "Incluido en esta sucursal"
                : "No contratado acá"}
            </span>
          </div>
          <div
            className={`rounded-2xl border p-4 ${
              c.moduloEspera
                ? "border-espera bg-espera/10 ring-2 ring-espera/30"
                : "border-linea bg-crema/30 opacity-55"
            }`}
          >
            <span className="font-semibold text-carbon">Espera de mesa</span>
            <span className="mt-1 block text-xs text-carbon/55">
              {c.moduloEspera
                ? "Incluido en esta sucursal"
                : "No contratado acá"}
            </span>
          </div>
        </div>
        {c.moduloEspera && (
          <div className="mt-4 max-w-xs">
            <Campo label={t("config.cantidadMesas")} error={errors.mesas}>
              <input
                type="number"
                min={1}
                className={`${INPUT} ${errors.mesas ? "border-red-400" : ""}`}
                value={c.tableCount}
                onChange={(e) => {
                  c.setCantidadMesas(parseInt(e.target.value, 10));
                  setErrors((er) => ({ ...er, mesas: undefined }));
                }}
              />
            </Campo>
            <p className="mt-1.5 text-xs text-carbon/50">
              Tocá Guardar para aplicar el cambio en el mapa de mesas.
            </p>
          </div>
        )}
      </section>

      {c.moduloPedidos && c.moduloEspera && (
        <section className={CARD}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-carbon/60">
            Este dispositivo
          </h2>
          <p className="mb-4 mt-1 text-sm text-carbon/55">
            Ideal si tenés una tablet en recepción y otra en el mostrador. Se
            guarda solo en este aparato, no limita cuántos dispositivos usan
            la sucursal.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                ["ambos", "Ambos módulos"],
                ["pedidos", "Solo pedidos"],
                ["espera", "Solo espera"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setDispositivo(id);
                  saveDeviceMode(id);
                }}
                className={`rounded-2xl border p-4 text-left transition ${
                  dispositivo === id
                    ? id === "espera"
                      ? "border-espera bg-espera/10 ring-2 ring-espera/30"
                      : "border-marca bg-marca/10 ring-2 ring-marca/30"
                    : "border-linea bg-crema/30"
                }`}
              >
                <span className="font-semibold text-carbon">{label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className={CARD}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-carbon/60">
          {t("config.seccionId")}
        </h2>
        <p className="mb-4 mt-1 text-sm text-carbon/55">
          {t("config.seccionIdSub")}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {modes.map((m) => {
            const active = c.modo === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => c.setModo(m.id)}
                className={`flex cursor-pointer flex-col gap-1 rounded-2xl border p-4 text-left transition hover:opacity-90 ${
                  active
                    ? "border-marca bg-marca/10 ring-2 ring-marca/30"
                    : "border-linea bg-crema/30"
                }`}
              >
                <span className="font-semibold text-carbon">{m.label}</span>
                <span className="text-xs leading-snug text-carbon/55">
                  {m.det}
                </span>
              </button>
            );
          })}
        </div>
        {c.modo === "mesa" && !c.moduloEspera && (
          <div className="mt-4 max-w-xs">
            <Campo label={t("config.cantidadMesas")} error={errors.mesas}>
              <input
                type="number"
                min={1}
                className={`${INPUT} ${errors.mesas ? "border-red-400" : ""}`}
                value={c.tableCount}
                onChange={(e) => {
                  c.setCantidadMesas(parseInt(e.target.value, 10));
                  setErrors((er) => ({ ...er, mesas: undefined }));
                }}
              />
            </Campo>
          </div>
        )}

        <div className="mt-4 max-w-xs border-t border-linea pt-4">
          <Campo label="Corte del día">
            <Select
              value={String(c.cutoffHour)}
              onChange={(v) => c.setHoraCorte(parseInt(v, 10))}
              options={HORAS_CORTE}
              triggerClassName="px-4 py-3"
            />
          </Campo>
          <p className="mt-1.5 text-xs text-carbon/50">
            La jornada arranca a esta hora. Los pedidos de después de medianoche
            cuentan para el mismo día hasta acá. Útil para bares (default 06:00).
          </p>
        </div>
      </section>

      <section className={CARD}>
        <EmployeeList />
      </section>
    </div>
  );
};

const ConfigPageGate = () => (
  <AdminGate>
    <ConfigPage />
  </AdminGate>
);

export default ConfigPageGate;

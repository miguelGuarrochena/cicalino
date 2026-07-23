"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore } from "@/lib/store/session-store";
import { NoAccess } from "@/components/ui/NoAccess";
import { EmployeeList } from "@/components/panel/EmployeeList";
import {
  useConfigStore,
  type IdentificationMode,
} from "@/lib/store/config-store";
import { isWhatsapp } from "@/lib/validations";

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 placeholder:text-carbon/40";
const CARD =
  "rounded-[24px] border border-linea bg-surface p-4 shadow-sm sm:p-6";

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
  nombre?: string;
  whatsapp?: string;
  direccion?: string;
  mesas?: string;
};

const ConfigPage = () => {
  const { t } = useApp();
  const role = useSessionStore((s) => s.rol);
  const c = useConfigStore();
  const [guardado, setGuardado] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

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
        if (role === "admin") {
          if (!c.nombre.trim()) next.nombre = t("config.errNombre");
          if (!isWhatsapp(c.whatsapp)) next.whatsapp = t("config.errWhatsapp");
          if (!c.direccion.trim()) next.direccion = t("config.errDireccion");
        }
        if (c.modo === "mesa" && (!c.cantidadMesas || c.cantidadMesas < 1)) {
          next.mesas = t("config.errMesas");
        }
        return next;
      };

  const guardar = () => {
        const next = validar();
        setErrors(next);
        if (Object.keys(next).length) return;
        setGuardado(true);
        setTimeout(() => setGuardado(false), 2200);
      };

  if (role === "empleado" || role === "superadmin") return <NoAccess />;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
          {t("config.titulo")}
        </h1>
        <button
          type="button"
          onClick={guardar}
          className="w-full rounded-full bg-marca px-5 py-3 text-sm font-semibold text-crema shadow-sm transition hover:bg-marca-fuerte active:scale-95 sm:w-auto"
        >
          {guardado ? `✓ ${t("config.guardado")}` : t("config.guardar")}
        </button>
      </div>

      {role === "admin" && (
        <section className={CARD}>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-carbon/60">
            {t("config.seccionLocal")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label={`${t("config.nombre")} *`} error={errors.nombre}>
              <input
                className={`${INPUT} ${errors.nombre ? "border-red-400" : ""}`}
                value={c.nombre}
                onChange={(e) => {
                  c.setCampo("nombre", e.target.value);
                  setErrors((er) => ({ ...er, nombre: undefined }));
                }}
                placeholder="Café Demo"
              />
            </Campo>
            <Campo label={t("config.tipo")}>
              <select
                className={INPUT}
                value={c.tipo}
                onChange={(e) => c.setCampo("tipo", e.target.value)}
              >
                <option value="cafeteria">Cafetería</option>
                <option value="panaderia">Panadería</option>
                <option value="rotiseria">Rotisería</option>
                <option value="heladeria">Heladería</option>
                <option value="otro">Otro</option>
              </select>
            </Campo>
            <Campo label={t("config.whatsapp")} error={errors.whatsapp}>
              <input
                className={`${INPUT} ${errors.whatsapp ? "border-red-400" : ""}`}
                value={c.whatsapp}
                onChange={(e) => {
                  c.setCampo("whatsapp", e.target.value);
                  setErrors((er) => ({ ...er, whatsapp: undefined }));
                }}
                placeholder="+54 9 11 5555 5555"
              />
            </Campo>
            <Campo label={`${t("config.direccion")} *`} error={errors.direccion}>
              <input
                className={`${INPUT} ${errors.direccion ? "border-red-400" : ""}`}
                value={c.direccion}
                onChange={(e) => {
                  c.setCampo("direccion", e.target.value);
                  setErrors((er) => ({ ...er, direccion: undefined }));
                }}
                placeholder="Av. Siempreviva 742"
              />
            </Campo>
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
        {c.modo === "mesa" && (
          <div className="mt-4 max-w-xs">
            <Campo label={t("config.cantidadMesas")} error={errors.mesas}>
              <input
                type="number"
                min={1}
                className={`${INPUT} ${errors.mesas ? "border-red-400" : ""}`}
                value={c.cantidadMesas}
                onChange={(e) => {
                  c.setCantidadMesas(parseInt(e.target.value, 10));
                  setErrors((er) => ({ ...er, mesas: undefined }));
                }}
              />
            </Campo>
          </div>
        )}
      </section>

      <section className={CARD}>
        <EmployeeList />
      </section>
    </div>
  );
};
export default ConfigPage;

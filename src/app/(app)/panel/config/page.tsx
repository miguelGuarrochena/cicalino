"use client";

import { SubscriptionCard } from "@/components/panel/SubscriptionCard";
import { useState } from "react";
import { useBrowserValue } from "@/lib/hooks/useBrowserValue";
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
import { businessTypeLabel } from "@/lib/types";
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

/* Reservation window options every 30 min from 08:00 to 23:30. */
const HORAS_RESERVA = (() => {
  const out: { value: string; label: string }[] = [];
  for (let m = 8 * 60; m <= 23 * 60 + 30; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    out.push({
      value: String(m),
      label: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
    });
  }
  return out;
})();

const DIAS_SEMANA = [
  { id: 1, es: "Lun", en: "Mon" },
  { id: 2, es: "Mar", en: "Tue" },
  { id: 3, es: "Mié", en: "Wed" },
  { id: 4, es: "Jue", en: "Thu" },
  { id: 5, es: "Vie", en: "Fri" },
  { id: 6, es: "Sáb", en: "Sat" },
  { id: 0, es: "Dom", en: "Sun" },
] as const;

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
  reservaHorario?: string;
};

/* Lo que edita esta pantalla y viaja a la base al tocar Guardar. */
interface Operacion {
  modo: IdentificationMode;
  tableCount: number;
  cutoffHour: number;
  reservaAbreMin: number;
  reservaCierraMin: number;
  diasCerrados: number[];
}

/* Borrador: solamente los campos que el usuario tocó en esta pantalla.
 *
 * Antes cada tecla escribía directo al store, que está persistido. Como
 * useWaitlist sincroniza las mesas contra `tableCount` cuando se monta, un
 * número tipeado y no guardado creaba —o borraba— mesas en la base con solo
 * navegar a Sala. Acá el store no se toca hasta que la base aceptó el cambio.
 *
 * Lo que no está en el borrador sigue al store, así que si la sucursal
 * termina de hidratarse mientras alguien edita, los campos sin tocar se
 * actualizan solos y los tocados conservan lo que se escribió. Es el mismo
 * patrón que ya usaba `dispositivo` más abajo.
 *
 * `tableCount: null` es el input vacío mientras se tipea. */
type Draft = Partial<Omit<Operacion, "tableCount">> & {
  tableCount?: number | null;
};

/* El campo vacío se guarda como null en vez de saltar a 1: el store clampeaba
 * el NaN y el input se corregía solo mientras alguien tipeaba. */
const parseMesas = (raw: string): number | null => {
  if (raw.trim() === "") return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(500, n)) : null;
};

const mismosDias = (a: number[], b: number[]): boolean => {
  if (a.length !== b.length) return false;
  const x = [...a].sort((m, n) => m - n);
  const y = [...b].sort((m, n) => m - n);
  return x.every((v, i) => v === y[i]);
};

const ConfigPage = () => {
  const { t, locale } = useApp();
  const toast = useToast();
  const role = useSessionStore((s) => s.rol);
  const branchId = useSessionStore((s) => s.sucursalId);
  const c = useConfigStore();
  const [guardado, setGuardado] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [draft, setDraft] = useState<Draft>({});

  const editar = <K extends keyof Draft>(campo: K, valor: Draft[K]) => {
    setDraft((d) => ({ ...d, [campo]: valor }));
  };

  const modo = draft.modo ?? c.modo;
  const cutoffHour = draft.cutoffHour ?? c.cutoffHour;
  const reservaAbreMin = draft.reservaAbreMin ?? c.reservaAbreMin;
  const reservaCierraMin = draft.reservaCierraMin ?? c.reservaCierraMin;
  const diasCerrados = draft.diasCerrados ?? c.diasCerrados;
  const tableCount =
    draft.tableCount === undefined ? c.tableCount : draft.tableCount;

  /* Por valor y no por "hay algo en el borrador": volver un campo a como
   * estaba tiene que apagar el aviso de cambios sin guardar. */
  const dirty =
    modo !== c.modo ||
    tableCount !== c.tableCount ||
    cutoffHour !== c.cutoffHour ||
    reservaAbreMin !== c.reservaAbreMin ||
    reservaCierraMin !== c.reservaCierraMin ||
    !mismosDias(diasCerrados, c.diasCerrados);

  /* Lo guardado en el dispositivo, más lo que el usuario haya cambiado en esta
   * sesión. Se lee con useSyncExternalStore porque en el servidor no existe. */
  const dispositivoGuardado = useBrowserValue<DeviceMode>(readDeviceMode, "ambos");
  const [elegido, setElegido] = useState<DeviceMode | null>(null);
  const dispositivo = elegido ?? dispositivoGuardado;
  const setDispositivo = setElegido;

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
    if ((modo === "mesa" || c.moduloEspera) && (!tableCount || tableCount < 1)) {
      next.mesas = t("config.errMesas");
    }
    if (c.moduloEspera && reservaAbreMin >= reservaCierraMin) {
      next.reservaHorario = t("config.errReservaHorario");
    }
    return next;
  };

  const guardar = async () => {
    if (saving) return;
    const next = validar();
    setErrors(next);
    if (Object.keys(next).length) return;

    const id = branchId;
    /* validar() ya descartó el input vacío cuando la cantidad importa; si el
     * módulo no la usa, se guarda lo que había. */
    const cfg: Operacion = {
      modo,
      tableCount: tableCount ?? c.tableCount,
      cutoffHour,
      reservaAbreMin,
      reservaCierraMin,
      diasCerrados,
    };

    setSaving(true);
    try {
      if (supabaseConfigured && isRealBranchId(id)) {
        const ok = await saveBranchConfig(id, cfg);
        if (!ok) {
          toast(t("toast.configError"), "error");
          return;
        }
        /* El store recién se toca con la base conforme: si el guardado falla,
         * el borrador queda como estaba y las mesas no se mueven. */
        c.hydrate(cfg);
        setDraft({});
        if (c.moduloEspera || cfg.modo === "mesa") {
          await syncTables(id, cfg.tableCount);
        }
      } else {
        c.hydrate(cfg);
        setDraft({});
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
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
          {dirty && !saving && (
            <span
              role="status"
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-amber-400/60 bg-amber-50/80 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:bg-amber-400/10 dark:text-amber-200"
            >
              <span className="size-1.5 rounded-full bg-amber-500" />
              {t("config.sinGuardar")}
            </span>
          )}
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
      </div>

      {role === "admin" && (
        <section className={CARD}>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-carbon/60">
            {t("config.seccionLocal")}
          </h2>
          <p className="mb-4 text-sm text-carbon/55">
{t("config.datosLocalSub")}
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
                {businessTypeLabel(c.tipo, locale === "en" ? "en" : "es")}
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
          {t("config.seccionModulos")}
        </h2>
        <p className="mb-4 mt-1 text-sm text-carbon/55">
          {t("config.seccionModulosSub")}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div
            className={`rounded-2xl border p-4 ${
              c.moduloPedidos
                ? "border-marca bg-marca/10 ring-2 ring-marca/30"
                : "border-linea bg-crema/30 opacity-55"
            }`}
          >
            <span className="font-semibold text-carbon">{t("config.moduloPedidos")}</span>
            <span className="mt-1 block text-xs text-carbon/55">
              {c.moduloPedidos
                ? t("config.moduloIncluido")
                : t("config.moduloNo")}
            </span>
          </div>
          <div
            className={`rounded-2xl border p-4 ${
              c.moduloEspera
                ? "border-espera bg-espera/10 ring-2 ring-espera/30"
                : "border-linea bg-crema/30 opacity-55"
            }`}
          >
            <span className="font-semibold text-carbon">{t("config.moduloEspera")}</span>
            <span className="mt-1 block text-xs text-carbon/55">
              {c.moduloEspera
                ? t("config.moduloIncluido")
                : t("config.moduloNo")}
            </span>
          </div>
        </div>
        {c.moduloEspera && (
          <div className="mt-4 flex flex-col gap-5">
            <div className="max-w-xs">
              <Campo label={t("config.tableCount")} error={errors.mesas}>
                <input
                  type="number"
                  min={1}
                  className={`${INPUT} ${errors.mesas ? "border-red-400" : ""}`}
                  value={tableCount ?? ""}
                  onChange={(e) => {
                    editar("tableCount", parseMesas(e.target.value));
                    setErrors((er) => ({ ...er, mesas: undefined }));
                  }}
                />
              </Campo>
              <p className="mt-1.5 text-xs text-carbon/50">
                {t("config.mesasAplicar")}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-carbon/70">
                {t("config.reservaHorario")}
              </p>
              <p className="mt-1 text-xs text-carbon/50">
                {t("config.reservaHorarioSub")}
              </p>
              <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
                <Campo label={t("config.reservaAbre")}>
                  <Select
                    value={String(reservaAbreMin)}
                    onChange={(v) => {
                      editar("reservaAbreMin", parseInt(v, 10));
                      setErrors((er) => ({
                        ...er,
                        reservaHorario: undefined,
                      }));
                    }}
                    options={HORAS_RESERVA}
                    triggerClassName="px-4 py-3"
                  />
                </Campo>
                <Campo
                  label={t("config.reservaCierra")}
                  error={errors.reservaHorario}
                >
                  <Select
                    value={String(reservaCierraMin)}
                    onChange={(v) => {
                      editar("reservaCierraMin", parseInt(v, 10));
                      setErrors((er) => ({
                        ...er,
                        reservaHorario: undefined,
                      }));
                    }}
                    options={HORAS_RESERVA}
                    triggerClassName="px-4 py-3"
                  />
                </Campo>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-carbon/70">
                {t("config.diasCerrados")}
              </p>
              <p className="mt-1 text-xs text-carbon/50">
                {t("config.diasCerradosSub")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DIAS_SEMANA.map((d) => {
                  const cerrado = diasCerrados.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() =>
                        editar(
                          "diasCerrados",
                          cerrado
                            ? diasCerrados.filter((x) => x !== d.id)
                            : [...diasCerrados, d.id],
                        )
                      }
                      className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                        cerrado
                          ? "bg-rose-500 text-white"
                          : "border border-linea bg-surface text-carbon/70 hover:bg-carbon/5"
                      }`}
                      title={
                        cerrado
                          ? locale === "en"
                            ? "Closed — tap to open"
                            : "Cerrado — tocá para abrir"
                          : locale === "en"
                            ? "Open — tap to close"
                            : "Abierto — tocá para cerrar"
                      }
                    >
                      {locale === "en" ? d.en : d.es}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-carbon/45">
                {locale === "en"
                  ? "Red = closed (hidden in + Reservation)."
                  : "Rojo = cerrado (no aparece en + Reserva)."}
              </p>
            </div>
          </div>
        )}
      </section>

      {c.moduloPedidos && c.moduloEspera && (
        <section className={CARD}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-carbon/60">
            {t("config.seccionDispositivo")}
          </h2>
          <p className="mb-4 mt-1 text-sm text-carbon/55">
            {t("config.seccionDispositivoSub")}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                ["ambos", t("config.dispAmbos")],
                ["pedidos", t("config.dispPedidos")],
                ["espera", t("config.dispEspera")],
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
            const active = modo === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => editar("modo", m.id)}
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
        {modo === "mesa" && !c.moduloEspera && (
          <div className="mt-4 max-w-xs">
            <Campo label={t("config.tableCount")} error={errors.mesas}>
              <input
                type="number"
                min={1}
                className={`${INPUT} ${errors.mesas ? "border-red-400" : ""}`}
                value={tableCount ?? ""}
                onChange={(e) => {
                  editar("tableCount", parseMesas(e.target.value));
                  setErrors((er) => ({ ...er, mesas: undefined }));
                }}
              />
            </Campo>
          </div>
        )}

        <div className="mt-4 max-w-xs border-t border-linea pt-4">
          <Campo label={t("config.corte")}>
            <Select
              value={String(cutoffHour)}
              onChange={(v) => editar("cutoffHour", parseInt(v, 10))}
              options={HORAS_CORTE}
              triggerClassName="px-4 py-3"
            />
          </Campo>
          <p className="mt-1.5 text-xs text-carbon/50">
            {t("config.corteSub")}
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

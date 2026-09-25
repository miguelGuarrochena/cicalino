"use client";

import { SubscriptionCard } from "@/components/panel/SubscriptionCard";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  goToConfigSection,
  readConfigSection,
  subscribeConfigSection,
} from "@/components/panel/config/configHash";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore } from "@/lib/store/session-store";
import { EmployeeList } from "@/components/panel/EmployeeList";
import {
  useConfigStore,
  type IdentificationMode,
} from "@/lib/store/config-store";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { saveBranchConfig } from "@/lib/data/branch";
import {
  needsTableCount,
  pedidosEnMesa,
  usesTableMenu,
  type PedidosModalidad,
} from "@/lib/modules";
import { syncTables } from "@/lib/data/waitlist";
import { PedirSucursalCard } from "@/components/panel/PedirSucursalCard";
import { HelpLink } from "@/components/panel/HelpLink";
import { PaymentMethodsCard } from "@/components/panel/config/PaymentMethodsCard";
import { BrandIdentityCard } from "@/components/panel/config/BrandIdentityCard";
import { supabaseConfigured } from "@/lib/supabase/config";
import { isRealBranchId } from "@/lib/data/orders";
import { businessTypeLabel } from "@/lib/types";
import { saveDeviceMode, type DeviceMode } from "@/lib/modules";
import { useDeviceMode } from "@/lib/hooks/useDeviceMode";

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 placeholder:text-carbon/40";
const ACCORDION =
  "group rounded-[24px] border border-linea bg-surface px-4 shadow-sm sm:px-6";

const Accordion = ({
  id,
  title,
  open,
  onOpenChange,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) => {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.open !== open) el.open = open;
  }, [open]);

  return (
    <details
      ref={ref}
      id={id}
      className={`${ACCORDION} scroll-mt-40 sm:scroll-mt-32`}
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        if (next !== open) onOpenChange(next);
      }}
    >
      <summary className="flex min-h-12 min-w-0 cursor-pointer list-none items-center justify-between gap-3 py-2 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 text-sm font-semibold uppercase tracking-wide text-carbon/60">
          {title}
        </span>
        <span className="shrink-0 text-lg leading-none text-carbon/30 transition group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="min-w-0 pb-4">{children}</div>
    </details>
  );
};

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
  pedidosModalidad: PedidosModalidad;
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
  const [openId, setOpenId] = useState("");

  useEffect(() => {
    const sync = () => setOpenId(readConfigSection());
    sync();
    return subscribeConfigSection(sync);
  }, []);

  useEffect(() => {
    if (!openId) return;
    const el = document.getElementById(openId);
    if (!el) return;
    const frame = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openId]);

  const setOpenSection = (id: string) => {
    setOpenId(id);
    goToConfigSection(id, "replace");
  };

  const editar = <K extends keyof Draft>(campo: K, valor: Draft[K]) => {
    setDraft((d) => ({ ...d, [campo]: valor }));
  };

  const modo = draft.modo ?? c.modo;
  const pedidosModalidad = draft.pedidosModalidad ?? c.pedidosModalidad;
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
    pedidosModalidad !== c.pedidosModalidad ||
    tableCount !== c.tableCount ||
    cutoffHour !== c.cutoffHour ||
    reservaAbreMin !== c.reservaAbreMin ||
    reservaCierraMin !== c.reservaCierraMin ||
    !mismosDias(diasCerrados, c.diasCerrados);

  /* Lo guardado en el dispositivo, más lo que el usuario haya cambiado en esta
   * sesión. Se lee con useSyncExternalStore porque en el servidor no existe. */
  const dispositivoGuardado = useDeviceMode();
  const [elegido, setElegido] = useState<DeviceMode | null>(null);
  const dispositivo = elegido ?? dispositivoGuardado;
  const setDispositivo = setElegido;

  /* Las tres, siempre que el local tenga Pedidos (que es lo que abre esta
   * sección). Identificar por mesa es una forma legítima de numerar los
   * pedidos aunque el local no tenga Recepción ni Pagos: lo único que hace
   * falta es saber cuántas mesas hay, y elegir este modo es justamente lo que
   * hace aparecer esa configuración. */
  const modes: {
    id: IdentificationMode;
    label: string;
    det: string;
  }[] = [
    { id: "pedido", label: t("config.idModoPedido"), det: t("config.modoPedidoDet") },
    { id: "nombre", label: t("config.idModoNombre"), det: t("config.modoNombreDet") },
    { id: "mesa", label: t("config.idModoMesa"), det: t("config.modoMesaDet") },
  ];

  /* La misma respuesta para la sección, la pestaña y la validación. */
  const modulos = { pedidos: c.moduloPedidos, espera: c.moduloEspera, pagos: c.moduloPagos };
  const pideMesas = needsTableCount(modulos, modo, pedidosModalidad);
  /* Lo guardado manda para lo que depende de la base (cobros, QR, carta): con
   * la modalidad elegida pero sin guardar, la base todavía no la conoce. */
  const enMesaGuardado = pedidosEnMesa(modulos, c.pedidosModalidad);
  const enMesaBorrador = pedidosEnMesa(modulos, pedidosModalidad);
  const cobrosVisibles = usesTableMenu(modulos, c.pedidosModalidad);

  const modalidades: { id: PedidosModalidad; label: string; det: string }[] = [
    { id: "mostrador", label: t("retiroConfig.mostrador"), det: t("retiroConfig.mostradorDet") },
    { id: "mesa", label: t("retiroConfig.mesa"), det: t("retiroConfig.mesaDet") },
  ];

  const validar = (): FormErrors => {
    const next: FormErrors = {};
    if (pideMesas && (!tableCount || tableCount < 1)) {
      next.mesas = t("config.errMesas");
    }
    if (c.moduloEspera && reservaAbreMin >= reservaCierraMin) {
      next.reservaHorario = t("config.errReservaHorario");
    }
    return next;
  };

  const guardar = async () => {
    if (saving) return;
    /* Nada se guarda hasta que la sucursal terminó de hidratar.
     *
     * Lo que no está en el borrador se escribe con el valor del store, así que
     * guardar en esa ventana mandaría a la base lo que el store traía de
     * antes: el default del cliente nuevo, o peor, el modo de la sucursal
     * anterior si acaban de cambiar de sucursal. Un local que tenía "mesa" y
     * no está mirando esta sección —porque no tiene Pedidos contratado— se
     * habría quedado en "número" sin tocar nada. */
    if (!c.branchConfigReady) return;
    const next = validar();
    setErrors(next);
    if (Object.keys(next).length) return;

    const id = branchId;
    /* validar() ya descartó el input vacío cuando la cantidad importa; si el
     * módulo no la usa, se guarda lo que había. */
    const cfg: Operacion = {
      modo,
      pedidosModalidad,
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
        /* La misma regla de siempre: las mesas se sincronizan solo si hay
         * algo que las use. */
        if (
          needsTableCount(
            { pedidos: c.moduloPedidos, espera: c.moduloEspera, pagos: c.moduloPagos },
            cfg.modo,
            cfg.pedidosModalidad,
          )
        ) {
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

  const acc = (id: string) => ({
    id,
    open: openId === id,
    onOpenChange: (open: boolean) => setOpenSection(open ? id : ""),
  });

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
              {t("config.titulo")}
            </h1>
            <p className="mt-1 text-sm text-carbon/55">{t("config.subtitulo")}</p>
          </div>
          <HelpLink seccion="config" />
        </div>
        {dirty && !saving && (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 self-start rounded-full border border-amber-400/60 bg-amber-50/80 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:bg-amber-400/10 dark:text-amber-200"
          >
            <span className="size-1.5 rounded-full bg-amber-500" />
            {t("config.sinGuardar")}
          </span>
        )}
      </div>

      <Accordion
        {...acc("local")}
        title={t("config.seccionLocal")}
      >
        <div className="flex flex-col gap-5">
          <SubscriptionCard embedded />
          {role === "admin" && (
            <div>
              <p className="mb-3 text-sm text-carbon/55">{t("config.datosLocalSub")}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-sm font-medium text-carbon/70">
                    {t("config.direccion")}
                  </span>
                  <p className="rounded-xl border border-linea bg-crema/30 px-4 py-3 text-carbon">
                    {c.direccion.trim() || "—"}
                  </p>
                </div>
              </div>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-carbon/70">
              {t("config.seccionModulos")}
            </p>
            <p className="mb-3 mt-1 text-xs text-carbon/50">
              {t("config.seccionModulosSub")}
            </p>
            <ul className="flex flex-wrap gap-2">
              {(
                [
                  ["pedidos", c.moduloPedidos, t("config.moduloPedidos")],
                  ["espera", c.moduloEspera, t("config.moduloEspera")],
                  ["pagos", c.moduloPagos, t("config.moduloPagos")],
                ] as const
              ).map(([id, on, label]) => (
                <li
                  key={id}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    on
                      ? "border-marca/40 bg-marca/10 text-carbon"
                      : "border-linea bg-crema/40 text-carbon/45"
                  }`}
                >
                  {label}
                  <span className="ml-1.5 font-medium text-carbon/50">
                    {on ? t("config.moduloIncluido") : t("config.moduloNo")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {role === "admin" && supabaseConfigured && isRealBranchId(branchId) && (
            <PedirSucursalCard embedded />
          )}
        </div>
      </Accordion>

      <Accordion {...acc("identidad")} title={t("config.tab.identidad")}>
        <BrandIdentityCard embedded />
      </Accordion>

      {/* Cómo se identifica un pedido es de Pedidos y de nadie más. Vivía en
          "Avanzado", que se muestra siempre: un local que contrató solo
          Recepción o solo Pagos veía —y podía cambiar— una configuración que
          no usa en ninguna de sus pantallas. */}
      {c.moduloPedidos && (
        <Accordion {...acc("pedidos")} title={t("config.tab.pedidos")}>
          {/* Cómo funciona Pedidos. Va primero porque cambia todo lo demás:
              en modalidad Mesa el cliente pide y paga solo desde el QR de su
              mesa y retira en el mostrador. */}
          <p className="text-sm font-medium text-carbon/70">{t("retiroConfig.titulo")}</p>
          <p className="mb-3 mt-1 text-xs text-carbon/50">{t("retiroConfig.sub")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {modalidades.map((m) => {
              const active = pedidosModalidad === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => editar("pedidosModalidad", m.id)}
                  className={`flex cursor-pointer flex-col gap-1 rounded-2xl border p-4 text-left transition hover:opacity-90 ${
                    active
                      ? "border-marca bg-marca/10 ring-2 ring-marca/30"
                      : "border-linea bg-crema/30"
                  }`}
                >
                  <span className="font-semibold text-carbon">{m.label}</span>
                  <span className="text-xs leading-snug text-carbon/55">{m.det}</span>
                </button>
              );
            })}
          </div>
          {enMesaBorrador && (
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-linea bg-crema/30 p-4">
              <p className="text-sm text-carbon/70">{t("retiroConfig.mesaComo")}</p>
              {c.moduloPagos && (
                <p className="text-xs font-medium text-curso">{t("retiroConfig.conPagos")}</p>
              )}
              {enMesaGuardado ? (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/panel/pedidos/qr"
                    className="inline-flex min-h-11 items-center rounded-full border-2 border-marca px-4 text-sm font-semibold text-marca transition hover:bg-marca hover:text-crema"
                  >
                    {t("retiroConfig.irQr")}
                  </Link>
                  <Link
                    href="/panel/menu"
                    className="inline-flex min-h-11 items-center rounded-full border border-linea px-4 text-sm font-semibold text-carbon/75"
                  >
                    {t("retiroConfig.irCarta")}
                  </Link>
                </div>
              ) : (
                <p className="text-xs text-carbon/55">{t("retiroConfig.guardaPrimero")}</p>
              )}
            </div>
          )}

          <p className="mb-4 mt-6 text-sm text-carbon/55">{t("config.seccionIdSub")}</p>
          <p className="text-sm font-medium text-carbon/70">{t("config.seccionId")}</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        </Accordion>
      )}

      {cobrosVisibles && isRealBranchId(branchId) && (
        <Accordion
          {...acc("pagos")}
          title={c.moduloPagos ? t("config.tab.pagos") : t("retiroConfig.cobrosTab")}
        >
          {!c.moduloPagos && enMesaGuardado && (
            <p className="mb-4 text-sm text-carbon/55">{t("retiroConfig.cobrosSub")}</p>
          )}
          <PaymentMethodsCard
            branchId={branchId}
            canEdit={role === "admin"}
            hideHeading
          />
        </Accordion>
      )}

      {pideMesas && (
        <Accordion {...acc("mesas")} title={t("config.tab.mesas")}>
          <p className="mb-4 text-sm text-carbon/55">
            {t("config.seccionMesasSub")}
          </p>
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
              {c.moduloPagos ? t("config.mesasAplicarQr") : t("config.mesasAplicar")}
            </p>
          </div>
          {enMesaGuardado && isRealBranchId(branchId) ? (
            <div className="mt-5 border-t border-linea pt-5">
              <h3 className="text-sm font-semibold text-carbon">{t("mesasQr.titulo")}</h3>
              <p className="mt-1 text-sm text-carbon/55">{t("retiroConfig.qrCtaSub")}</p>
              <Link
                href="/panel/pedidos/qr"
                className="mt-3 inline-flex min-h-11 items-center rounded-full border-2 border-marca px-5 text-sm font-semibold text-marca transition hover:bg-marca hover:text-crema active:scale-[0.98]"
              >
                {t("config.mesasQrCta")}
              </Link>
            </div>
          ) : c.moduloPagos && isRealBranchId(branchId) && (
            <div className="mt-5 border-t border-linea pt-5">
              <h3 className="text-sm font-semibold text-carbon">{t("mesasQr.titulo")}</h3>
              <p className="mt-1 text-sm text-carbon/55">{t("config.mesasQrCtaSub")}</p>
              <Link
                href="/panel/pagos/qr"
                className="mt-3 inline-flex min-h-11 items-center rounded-full border-2 border-marca px-5 text-sm font-semibold text-marca transition hover:bg-marca hover:text-crema active:scale-[0.98]"
              >
                {t("config.mesasQrCta")}
              </Link>
            </div>
          )}
        </Accordion>
      )}

      {c.moduloEspera && (
        <Accordion {...acc("recepcion")} title={t("config.seccionRecepcion")}>
          <p className="mb-4 text-sm text-carbon/55">
            {t("config.seccionRecepcionSub")}
          </p>
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
        </Accordion>
      )}

      <Accordion {...acc("empleados")} title={t("config.tab.empleados")}>
        <EmployeeList hideHeading />
      </Accordion>

      {c.moduloPedidos && c.moduloEspera && (
        <Accordion {...acc("dispositivo")} title={t("config.seccionDispositivo")}>
          <p className="mb-4 text-sm text-carbon/55">
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
        </Accordion>
      )}

      <Accordion {...acc("avanzado")} title={t("config.seccionAvanzado")}>
        <p className="mb-4 text-sm text-carbon/55">
          {t("config.seccionAvanzadoSub")}
        </p>
        <div className="mt-5 max-w-xs border-t border-linea pt-5">
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

        {/* Antes esto vivía adentro de `c.moduloEspera`: los días cerrados eran
            "los que no aparecen en el calendario de reservas". Ahora valen para
            todo el panel —la plantilla de mesas, el historial, la jornada—, así
            que un local con Pedidos o Pagos también los tiene que poder
            marcar. */}
        <div className="mt-5 border-t border-linea pt-5">
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
                      ? "bg-alerta text-crema"
                      : "border border-linea bg-surface text-carbon/70 hover:bg-carbon/5"
                  }`}
                >
                  {locale === "en" ? d.en : d.es}
                </button>
              );
            })}
          </div>
        </div>
      </Accordion>

      {/* Guardar no se va de pantalla.
          Antes vivía arriba del todo y esta barra aparecía solo en el celular:
          abrías una sección de más abajo, cambiabas algo y te ibas a otra
          pantalla sin enterarte de que había quedado sin guardar. Ahora la
          barra está siempre, en cualquier tamaño, y dice cómo está la cosa. */}
      <div className="sticky bottom-20 z-20 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-linea bg-crema/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:bottom-0 sm:px-6">
        <p
          role="status"
          className={`min-w-0 text-xs font-semibold ${
            dirty ? "text-amber-700 dark:text-amber-300" : "text-carbon/45"
          }`}
        >
          {dirty ? t("config.sinGuardar") : t("config.alDia")}
        </p>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={saving || !dirty || !c.branchConfigReady}
          className="min-h-12 shrink-0 rounded-full bg-marca px-6 text-sm font-semibold text-crema transition active:scale-95 disabled:opacity-40"
        >
          {saving
            ? "…"
            : guardado
              ? `✓ ${t("config.guardado")}`
              : t("config.guardar")}
        </button>
      </div>
    </div>
  );
};

export default ConfigPage;

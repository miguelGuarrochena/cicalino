"use client";

import { useEffect, useMemo, useState } from "react";
import { ModuleSwitcher } from "@/components/panel/ModuleSwitcher";
import { QrModal } from "@/components/panel/QrModal";
import { ModalShell } from "@/components/ui/ModalShell";
import { Pagination, slicePage } from "@/components/ui/Pagination";
import { useApp } from "@/components/providers/Providers";
import { useEsperas } from "@/lib/hooks/useEsperas";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useToast } from "@/components/ui/Toast";
import {
  ETIQUETA_ESPERA,
  ETIQUETA_RESERVA,
  esperaClosed,
  type EsperaView,
  type ReservaView,
} from "@/lib/types";
import {
  leerDispositivoModo,
  modulosVisibles,
} from "@/lib/modulos";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

const PAGE_SIZE = 20;
const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none transition focus:border-espera focus:ring-2 focus:ring-espera/20 placeholder:text-carbon/40";

const BTN_MOBILE =
  "w-full rounded-full px-4 py-3.5 text-sm font-semibold transition active:scale-[0.98] sm:w-auto sm:px-4 sm:py-2.5";

const PERSONAS_CHIPS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const PersonasChips = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) => {
  const [otro, setOtro] = useState(value > 8);
  const [otroTexto, setOtroTexto] = useState(value > 8 ? String(value) : "");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {PERSONAS_CHIPS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setOtro(false);
              setOtroTexto("");
              onChange(n);
            }}
            className={`flex size-11 items-center justify-center rounded-xl text-sm font-bold transition active:scale-95 ${
              !otro && value === n
                ? "bg-espera text-crema"
                : "border border-linea bg-crema/40 text-carbon hover:border-espera/40"
            }`}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setOtro(true);
            if (value <= 8) {
              setOtroTexto("");
              onChange(9);
            }
          }}
          className={`flex h-11 min-w-11 items-center justify-center rounded-xl px-3 text-sm font-bold transition active:scale-95 ${
            otro
              ? "bg-espera text-crema"
              : "border border-linea bg-crema/40 text-carbon hover:border-espera/40"
          }`}
        >
          {otro && value > 8 ? value : "9+"}
        </button>
      </div>
      {otro && (
        <input
          type="number"
          min={9}
          max={50}
          inputMode="numeric"
          className={INPUT}
          placeholder="9, 10, 12…"
          value={otroTexto}
          autoFocus
          onChange={(e) => {
            const raw = e.target.value;
            setOtroTexto(raw);
            if (raw === "") return;
            const n = Number(raw);
            if (Number.isFinite(n) && n >= 1) onChange(Math.min(50, Math.max(1, n)));
          }}
          onBlur={() => {
            if (otroTexto === "" || Number(otroTexto) < 9) {
              setOtroTexto("9");
              onChange(9);
            }
          }}
        />
      )}
    </div>
  );
};

const mesaTileClass = (
  estado: "libre" | "ocupada" | "reservada",
  opts?: { pickable?: boolean; selected?: boolean; tooSmall?: boolean },
) => {
  const base =
    "flex aspect-square flex-col items-center justify-center rounded-2xl border-2 text-center transition";
  if (opts?.selected) {
    return `${base} border-espera bg-espera text-crema ring-2 ring-espera/40`;
  }
  if (opts?.tooSmall && estado === "libre") {
    return `${base} border-espera/30 bg-espera/15 text-espera/50 cursor-not-allowed`;
  }
  if (estado === "libre") {
    return `${base} border-espera bg-espera text-crema ${
      opts?.pickable ? "hover:bg-espera-fuerte active:scale-95" : ""
    }`;
  }
  if (estado === "reservada") {
    return `${base} border-amber-600 bg-amber-400 text-amber-950 ${
      opts?.pickable === false ? "cursor-not-allowed opacity-70" : ""
    }`;
  }
  return `${base} border-rose-700 bg-rose-600 text-white ${
    opts?.pickable === false ? "cursor-not-allowed opacity-70" : ""
  }`;
};

const minsAgo = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const defaultHorarioInput = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d);
};

const formatHora = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale === "en" ? "en-US" : "es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });

const EsperaPanelPage = () => {
  const { locale } = useApp();
  const toast = useToast();
  const router = useRouter();
  const branchId = useSessionStore((s) => s.sucursalId);
  const activeEmployee = useSessionStore((s) => s.empleadoActivo);
  const cantidadMesas = useConfigStore((s) => s.cantidadMesas);
  const moduloPedidos = useConfigStore((s) => s.moduloPedidos);
  const moduloEspera = useConfigStore((s) => s.moduloEspera);
  const dispositivo = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    leerDispositivoModo,
    () => "ambos" as const,
  );
  const visibles = modulosVisibles(
    { pedidos: moduloPedidos, espera: moduloEspera },
    dispositivo,
  );

  const {
    esperas,
    mesas,
    reservas,
    crearEspera,
    crearReserva,
    avisar,
    sentar,
    cancelar,
    sentarReserva,
    cancelarReserva,
    liberarMesa,
    setCapacidad,
  } = useEsperas(branchId);

  const [qr, setQr] = useState<EsperaView | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reservaOpen, setReservaOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [personas, setPersonas] = useState(2);
  const [creating, setCreating] = useState(false);
  const [reservaNombre, setReservaNombre] = useState("");
  const [reservaPersonas, setReservaPersonas] = useState(2);
  const [reservaMesa, setReservaMesa] = useState<number | null>(null);
  const [reservaHorario, setReservaHorario] = useState(defaultHorarioInput);
  const [reservaGracia, setReservaGracia] = useState<15 | 20>(15);
  const [creatingReserva, setCreatingReserva] = useState(false);
  const [sentarId, setSentarId] = useState<string | null>(null);
  const [confirmCancelEsperaId, setConfirmCancelEsperaId] = useState<
    string | null
  >(null);
  const [confirmCancelReservaId, setConfirmCancelReservaId] = useState<
    string | null
  >(null);
  const [editCapacidadNumero, setEditCapacidadNumero] = useState<number | null>(
    null,
  );
  const [editCapacidadValue, setEditCapacidadValue] = useState(4);
  const [liberarNumero, setLiberarNumero] = useState<number | null>(null);
  const [sentarMesas, setSentarMesas] = useState<number[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!visibles.espera && visibles.pedidos) router.replace("/panel");
  }, [visibles, router]);

  useEffect(() => {
    if (!qr) return;
    const fresh = esperas.find((e) => e.id === qr.id);
    if (fresh?.vistoEn) setQr(null);
  }, [esperas, qr]);

  const cola = useMemo(
    () =>
      esperas
        .filter((e) => e.estado === "esperando" || e.estado === "avisado")
        .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn)),
    [esperas],
  );
  const reservasActivas = useMemo(
    () => reservas.filter((r) => r.estado === "activa"),
    [reservas],
  );
  const reservaById = useMemo(() => {
    const map = new Map<string, ReservaView>();
    for (const r of reservas) map.set(r.id, r);
    return map;
  }, [reservas]);

  const libres = mesas.filter((m) => m.estado === "libre").length;
  const ocupadas = mesas.filter((m) => m.estado === "ocupada").length;
  const reservadas = mesas.filter((m) => m.estado === "reservada").length;
  const personasEnCola = cola.reduce((sum, e) => sum + e.personas, 0);
  const paginated = slicePage(cola, page, PAGE_SIZE);
  const sentarEspera = esperas.find((e) => e.id === sentarId);
  const mesasLibres = mesas.filter((m) => m.estado === "libre");
  const mesasLibresParaReserva = mesasLibres.filter(
    (m) => (m.capacidad ?? 4) >= reservaPersonas,
  );
  const confirmCancelEspera = esperas.find(
    (e) => e.id === confirmCancelEsperaId,
  );
  const confirmCancelReserva = reservas.find(
    (r) => r.id === confirmCancelReservaId,
  );
  const editCapacidadMesa = mesas.find((m) => m.numero === editCapacidadNumero);
  const liberarMesaView = mesas.find((m) => m.numero === liberarNumero);
  const liberarReserva =
    liberarMesaView?.reservaId != null
      ? reservaById.get(liberarMesaView.reservaId)
      : undefined;
  const CAPACIDADES_RAPIDAS = [2, 4, 6, 8, 10] as const;

  const hayMesaPara = (personasGrupo: number) => {
    const libresCap = mesas
      .filter((m) => m.estado === "libre")
      .map((m) => m.capacidad ?? 4)
      .sort((a, b) => b - a);
    if (!libresCap.length) return false;
    if (libresCap.some((c) => c >= personasGrupo)) return true;
    let sum = 0;
    for (const c of libresCap) {
      sum += c;
      if (sum >= personasGrupo) return true;
    }
    return false;
  };

  const employeeRef = activeEmployee
    ? { id: activeEmployee.id, nombre: activeEmployee.nombre }
    : null;

  const onCrear = async () => {
    if (creating) return;
    if (!nombre.trim()) {
      toast(locale === "en" ? "Enter a name" : "Ingresá un nombre", "error");
      return;
    }
    setCreating(true);
    try {
      const created = await crearEspera(nombre, personas, employeeRef);
      if (created) {
        setQr(created);
        setCreateOpen(false);
        setNombre("");
        setPersonas(2);
        toast(
          locale === "en" ? "Added to waitlist" : "En cola de espera",
          "success",
        );
      }
    } finally {
      setCreating(false);
    }
  };

  const onCrearReserva = async () => {
    if (creatingReserva) return;
    if (!reservaNombre.trim()) {
      toast(locale === "en" ? "Enter a name" : "Ingresá un nombre", "error");
      return;
    }
    if (!reservaMesa) {
      toast(locale === "en" ? "Pick a table" : "Elegí una mesa", "error");
      return;
    }
    const horario = new Date(reservaHorario);
    if (Number.isNaN(horario.getTime())) {
      toast(locale === "en" ? "Invalid time" : "Horario inválido", "error");
      return;
    }
    setCreatingReserva(true);
    try {
      const created = await crearReserva({
        nombre: reservaNombre,
        personas: reservaPersonas,
        mesaNumero: reservaMesa,
        horario: horario.toISOString(),
        graciaMinutos: reservaGracia,
        employee: employeeRef,
      });
      if (created) {
        setReservaOpen(false);
        setReservaNombre("");
        setReservaPersonas(2);
        setReservaMesa(null);
        setReservaHorario(defaultHorarioInput());
        setReservaGracia(15);
        toast(
          locale === "en"
            ? `Table ${created.mesaNumero} reserved`
            : `Mesa ${created.mesaNumero} reservada`,
          "success",
        );
      } else {
        toast(
          locale === "en"
            ? "Table not available"
            : "Mesa no disponible",
          "error",
        );
      }
    } finally {
      setCreatingReserva(false);
    }
  };

  if (!visibles.espera) return null;

  return (
    <div>
      <ModuleSwitcher />

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-espera">
            {locale === "en" ? "Table wait" : "Espera de mesa"}
          </p>
          <h1 className="font-display text-2xl uppercase tracking-tight text-carbon sm:text-3xl">
            {locale === "en" ? "Floor & queue" : "Sala y cola"}
          </h1>
          <p className="mt-1 text-sm text-carbon/55">
            {libres} {locale === "en" ? "free" : "libres"} · {reservadas}{" "}
            {locale === "en" ? "reserved" : "reservadas"} · {ocupadas}{" "}
            {locale === "en" ? "busy" : "ocupadas"} · {cola.length}{" "}
            {locale === "en" ? "parties" : "grupos"} · {personasEnCola}{" "}
            {locale === "en" ? "guests waiting" : "personas en cola"}
            {cantidadMesas ? ` · ${cantidadMesas} mesas` : ""}
          </p>
          <p className="mt-0.5 text-xs text-carbon/40">
            {locale === "en"
              ? "Tap busy/reserved to free · tap free to set seats"
              : "Tocá ocupada/reservada para liberar · libre para plazas"}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => {
              const firstFit =
                mesas.find(
                  (m) =>
                    m.estado === "libre" && (m.capacidad ?? 4) >= reservaPersonas,
                )?.numero ?? null;
              setReservaMesa(firstFit);
              setReservaHorario(defaultHorarioInput());
              setReservaOpen(true);
            }}
            className="w-full rounded-full border border-espera/40 bg-espera/10 px-5 py-3 text-sm font-semibold text-espera transition hover:bg-espera hover:text-crema sm:w-auto sm:py-2.5"
          >
            {locale === "en" ? "+ Reservation" : "+ Reserva"}
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="w-full rounded-full bg-espera px-5 py-3 text-sm font-semibold text-crema shadow-sm transition hover:bg-espera-fuerte sm:w-auto sm:py-2.5"
          >
            {locale === "en" ? "+ Add party" : "+ Agregar grupo"}
          </button>
        </div>
      </div>

      {/* Grid de mesas */}
      <section className="mb-6 rounded-[24px] border border-espera/25 bg-espera/[0.07] p-4 shadow-sm dark:border-espera/30 dark:bg-espera/10 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-carbon/70">
            {locale === "en" ? "Tables" : "Mesas"}
          </h2>
          <p className="text-xs text-carbon/45">
            {locale === "en"
              ? "Tap a free table to set seats"
              : "Tocá una mesa libre para definir plazas"}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-semibold uppercase tracking-wide text-carbon/50">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-espera" />
              {locale === "en" ? "Free" : "Libre"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-amber-400" />
              {locale === "en" ? "Reserved" : "Reservada"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-rose-600" />
              {locale === "en" ? "Busy" : "Ocupada"}
            </span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
          {mesas.map((m) => {
            const reserva =
              m.reservaId != null ? reservaById.get(m.reservaId) : undefined;
            const libre = m.estado === "libre";
            const reservada = m.estado === "reservada";
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  if (libre) {
                    setEditCapacidadNumero(m.numero);
                    setEditCapacidadValue(m.capacidad ?? 4);
                    return;
                  }
                  setLiberarNumero(m.numero);
                }}
                title={
                  libre
                    ? locale === "en"
                      ? "Tap to edit seats"
                      : "Tocar para editar plazas"
                    : reservada
                      ? locale === "en"
                        ? "Tap to cancel reservation"
                        : "Tocar para cancelar reserva"
                      : locale === "en"
                        ? "Tap to free"
                        : "Tocar para liberar"
                }
                className={mesaTileClass(m.estado, { pickable: libre })}
              >
                <span className="font-display text-lg leading-none">
                  {m.numero}
                </span>
                <span className="mt-1 text-[10px] font-bold uppercase tracking-wide opacity-90">
                  {libre
                    ? locale === "en"
                      ? "Free"
                      : "Libre"
                    : reservada
                      ? "Res."
                      : locale === "en"
                        ? "Busy"
                        : "Ocup."}
                </span>
                <span className="mt-0.5 text-[9px] font-semibold opacity-80">
                  {m.capacidad ?? 4}p
                </span>
                {reservada && reserva && (
                  <span className="mt-0.5 max-w-full truncate px-1 text-[9px] font-medium opacity-80">
                    {reserva.nombre}
                  </span>
                )}
              </button>
            );
          })}
          {!mesas.length && (
            <p className="col-span-full text-sm text-carbon/50">
              {locale === "en"
                ? "Set table count in Settings."
                : "Definí la cantidad de mesas en Configuración."}
            </p>
          )}
        </div>
      </section>

      {/* Reservas */}
      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-carbon/70">
            {locale === "en" ? "Reservations" : "Reservas"}
            {reservasActivas.length
              ? ` · ${reservasActivas.length}`
              : ""}
          </h2>
          {reservasActivas.length > 0 && (
            <p className="text-xs text-carbon/45">
              {locale === "en"
                ? "Auto-frees if they don’t arrive in time"
                : "Se libera sola si no llegan a tiempo"}
            </p>
          )}
        </div>
        {reservasActivas.length > 0 ? (
        <div className="flex flex-col gap-3">
          {reservasActivas.map((r) => (
            <article
              key={r.id}
              className="rounded-[20px] border border-amber-400/40 bg-amber-50/80 p-4 shadow-sm dark:bg-amber-400/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-xl uppercase tracking-tight text-carbon">
                      {r.nombre}
                    </h3>
                    <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950 dark:bg-amber-400/30 dark:text-amber-100">
                      {ETIQUETA_RESERVA[r.estado]}
                    </span>
                    <span className="rounded-full bg-carbon/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-carbon/70">
                      {locale === "en" ? "Table" : "Mesa"} {r.mesaNumero}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-carbon/55">
                    {formatHora(r.horario, locale)} · {r.personas}{" "}
                    {locale === "en" ? "guests" : "personas"} · +
                    {r.graciaMinutos} min
                    {r.empleado ? ` · ${r.empleado}` : ""}
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      void sentarReserva(r.id).then(() =>
                        toast(
                          locale === "en"
                            ? `Seated at table ${r.mesaNumero}`
                            : `Sentados en mesa ${r.mesaNumero}`,
                          "success",
                        ),
                      );
                    }}
                    className={`${BTN_MOBILE} bg-carbon text-crema hover:opacity-90`}
                  >
                    {locale === "en" ? "Seat" : "Sentar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancelReservaId(r.id)}
                    className={`${BTN_MOBILE} text-red-600/80 hover:bg-red-50`}
                  >
                    {locale === "en" ? "Cancel" : "Cancelar"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
        ) : (
          <p className="text-sm text-carbon/45">
            {locale === "en"
              ? "None today — use + Reservation when you need one."
              : "Ninguna hoy — usá + Reserva cuando haga falta."}
          </p>
        )}
      </section>

      {/* Cola */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-carbon/70">
          {locale === "en" ? "Waiting list" : "Cola de espera"}
          {cola.length ? ` · ${cola.length}` : ""}
        </h2>
        <div className="flex flex-col gap-3">
          {paginated.map((e, idx) => {
            const mins = minsAgo(e.creadoEn);
            const urgencia =
              mins >= 20 ? "text-rose-600" : mins >= 10 ? "text-amber-700" : "";
            const pos = (page - 1) * PAGE_SIZE + idx + 1;
            const puedeSentar = hayMesaPara(e.personas);
            return (
            <article
              key={e.id}
              className={`rounded-[20px] border bg-surface p-4 shadow-sm ${
                e.estado === "avisado"
                  ? "border-espera/50 bg-espera/5 ring-1 ring-espera/25"
                  : "border-linea"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-carbon/10 text-xs font-bold text-carbon/60">
                      {pos}
                    </span>
                    <h3 className="font-display text-xl uppercase tracking-tight text-carbon">
                      {e.nombre}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        e.estado === "avisado"
                          ? "bg-espera text-crema"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {ETIQUETA_ESPERA[e.estado]}
                    </span>
                  </div>
                  <p className={`mt-1 text-sm text-carbon/55 ${urgencia}`}>
                    {e.personas} {locale === "en" ? "guests" : "personas"} ·{" "}
                    <span className="font-semibold">{mins} min</span>
                    {e.empleado ? ` · ${e.empleado}` : ""}
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[9.5rem] sm:flex-row sm:flex-wrap">
                  {e.estado === "esperando" && (
                    <button
                      type="button"
                      onClick={() => void avisar(e.id)}
                      className={`${BTN_MOBILE} bg-espera text-crema hover:bg-espera-fuerte sm:flex-1`}
                    >
                      {locale === "en" ? "Notify" : "Avisar"}
                    </button>
                  )}
                  {(e.estado === "esperando" || e.estado === "avisado") && (
                    <button
                      type="button"
                      onClick={() => {
                        setSentarMesas([]);
                        setSentarId(e.id);
                      }}
                      disabled={!puedeSentar}
                      className={`${BTN_MOBILE} bg-carbon text-crema hover:opacity-90 disabled:opacity-40 sm:flex-1`}
                    >
                      {locale === "en" ? "Seat" : "Sentar"}
                    </button>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setQr(e)}
                      className={`${BTN_MOBILE} flex-1 border border-linea text-carbon/70 hover:bg-crema`}
                    >
                      QR
                    </button>
                    {!esperaClosed(e.estado) && (
                      <button
                        type="button"
                        onClick={() => setConfirmCancelEsperaId(e.id)}
                        className={`${BTN_MOBILE} flex-1 text-red-600/80 hover:bg-red-50`}
                      >
                        {locale === "en" ? "Cancel" : "Cancelar"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
            );
          })}
          {!cola.length && (
            <div className="rounded-[24px] border border-dashed border-espera/30 bg-espera/5 px-6 py-10 text-center">
              <p className="font-display text-lg uppercase text-espera">
                {locale === "en" ? "No one waiting" : "Nadie en espera"}
              </p>
              <p className="mt-1 text-sm text-carbon/50">
                {locale === "en"
                  ? "Tap + Add party when guests arrive."
                  : "Tocá + Agregar grupo cuando lleguen."}
              </p>
            </div>
          )}
        </div>
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={cola.length}
          onChange={setPage}
        />
      </section>

      {qr && (
        <QrModal
          referencia={qr.nombre}
          token={qr.qrToken}
          etiqueta={locale === "en" ? "Party" : "Grupo"}
          onClose={() => setQr(null)}
          pathPrefix="/e"
          accent="espera"
          onCancelar={() => {
            void cancelar(qr.id);
            setQr(null);
          }}
        />
      )}

      {createOpen && (
        <ModalShell
          onClose={() => {
            if (!creating) setCreateOpen(false);
          }}
          labelledBy="espera-crear-title"
        >
          <h2
            id="espera-crear-title"
            className="font-display text-xl uppercase tracking-tight text-carbon"
          >
            {locale === "en" ? "Add to waitlist" : "Agregar a la espera"}
          </h2>
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-carbon/70">
                {locale === "en" ? "Name" : "Nombre"}
              </span>
              <input
                className={INPUT}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onCrear();
                }}
                placeholder="García"
                autoFocus
              />
            </label>
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-carbon/70">
                {locale === "en" ? "Party size" : "Personas"}
              </span>
              <PersonasChips value={personas} onChange={setPersonas} />
            </div>
            <button
              type="button"
              disabled={creating}
              onClick={() => void onCrear()}
              className="mt-2 w-full rounded-full bg-espera px-5 py-3.5 text-sm font-semibold text-crema transition hover:bg-espera-fuerte disabled:opacity-60"
            >
              {creating
                ? "…"
                : locale === "en"
                  ? "Create & show QR"
                  : "Crear y mostrar QR"}
            </button>
          </div>
        </ModalShell>
      )}

      {reservaOpen && (
        <ModalShell
          onClose={() => {
            if (!creatingReserva) setReservaOpen(false);
          }}
          labelledBy="reserva-crear-title"
        >
          <h2
            id="reserva-crear-title"
            className="font-display text-xl uppercase tracking-tight text-carbon"
          >
            {locale === "en" ? "New reservation" : "Nueva reserva"}
          </h2>
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-carbon/70">
                {locale === "en" ? "Name" : "Nombre"}
              </span>
              <input
                className={INPUT}
                value={reservaNombre}
                onChange={(e) => setReservaNombre(e.target.value)}
                placeholder="Martínez"
                autoFocus
              />
            </label>
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-carbon/70">
                {locale === "en" ? "Party size" : "Personas"}
              </span>
              <PersonasChips
                value={reservaPersonas}
                onChange={(n) => {
                  setReservaPersonas(n);
                  const stillOk =
                    reservaMesa != null &&
                    mesas.some(
                      (m) =>
                        m.numero === reservaMesa &&
                        m.estado === "libre" &&
                        (m.capacidad ?? 4) >= n,
                    );
                  if (!stillOk) {
                    setReservaMesa(
                      mesas.find(
                        (m) =>
                          m.estado === "libre" && (m.capacidad ?? 4) >= n,
                      )?.numero ?? null,
                    );
                  }
                }}
              />
            </div>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-carbon/70">
                {locale === "en" ? "Date & time" : "Día y hora"}
              </span>
              <input
                type="datetime-local"
                className={INPUT}
                value={reservaHorario}
                onChange={(e) => setReservaHorario(e.target.value)}
              />
            </label>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-carbon/70">
                {locale === "en" ? "Table" : "Mesa"}
              </legend>
              <p className="mb-2 text-xs text-carbon/45">
                {locale === "en"
                  ? "Only free tables that fit the party."
                  : "Solo mesas libres que entren al grupo."}
              </p>
              {mesas.length ? (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {mesas.map((m) => {
                    const libre = m.estado === "libre";
                    const entra = (m.capacidad ?? 4) >= reservaPersonas;
                    const pickable = libre && entra;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={!pickable}
                        onClick={() => setReservaMesa(m.numero)}
                        className={mesaTileClass(m.estado, {
                          pickable,
                          selected: pickable && reservaMesa === m.numero,
                          tooSmall: libre && !entra,
                        })}
                      >
                        <span className="font-display text-xl leading-none">
                          {m.numero}
                        </span>
                        <span className="mt-1 text-[9px] font-bold uppercase tracking-wide opacity-90">
                          {libre
                            ? locale === "en"
                              ? "Free"
                              : "Libre"
                            : m.estado === "reservada"
                              ? "Res."
                              : locale === "en"
                                ? "Busy"
                                : "Ocup."}
                        </span>
                        <span className="mt-0.5 text-[9px] font-semibold opacity-80">
                          {m.capacidad ?? 4}p
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-carbon/50">
                  {locale === "en"
                    ? "No tables configured."
                    : "No hay mesas configuradas."}
                </p>
              )}
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-carbon/70">
                {locale === "en"
                  ? "Hold after time"
                  : "Espera después del horario"}
              </legend>
              <div className="flex gap-2">
                {([15, 20] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setReservaGracia(m)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      reservaGracia === m
                        ? "bg-espera text-crema"
                        : "border border-linea text-carbon/70 hover:bg-crema"
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              type="button"
              disabled={creatingReserva || !mesasLibresParaReserva.length}
              onClick={() => void onCrearReserva()}
              className="mt-2 rounded-full bg-espera px-5 py-3 text-sm font-semibold text-crema transition hover:bg-espera-fuerte disabled:opacity-60"
            >
              {creatingReserva
                ? "…"
                : locale === "en"
                  ? "Save reservation"
                  : "Guardar reserva"}
            </button>
          </div>
        </ModalShell>
      )}

      {confirmCancelEsperaId && confirmCancelEspera && (
        <ModalShell
          onClose={() => setConfirmCancelEsperaId(null)}
          labelledBy="cancel-espera-title"
        >
          <h2
            id="cancel-espera-title"
            className="font-display text-xl uppercase tracking-tight text-carbon"
          >
            {locale === "en" ? "Cancel this wait?" : "¿Cancelar esta espera?"}
          </h2>
          <p className="mt-2 text-sm text-carbon/60">
            {locale === "en"
              ? `${confirmCancelEspera.nombre} will leave the queue.`
              : `${confirmCancelEspera.nombre} sale de la cola.`}
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                void cancelar(confirmCancelEsperaId);
                setConfirmCancelEsperaId(null);
              }}
              className="w-full rounded-full bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-600"
            >
              {locale === "en" ? "Yes, cancel" : "Sí, cancelar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancelEsperaId(null)}
              className="w-full rounded-full border border-linea px-5 py-3 text-sm font-semibold text-carbon transition hover:bg-crema"
            >
              {locale === "en" ? "Keep waiting" : "Seguir en cola"}
            </button>
          </div>
        </ModalShell>
      )}

      {confirmCancelReservaId && confirmCancelReserva && (
        <ModalShell
          onClose={() => setConfirmCancelReservaId(null)}
          labelledBy="cancel-reserva-title"
        >
          <h2
            id="cancel-reserva-title"
            className="font-display text-xl uppercase tracking-tight text-carbon"
          >
            {locale === "en"
              ? "Cancel this reservation?"
              : "¿Cancelar esta reserva?"}
          </h2>
          <p className="mt-2 text-sm text-carbon/60">
            {locale === "en"
              ? `Table ${confirmCancelReserva.mesaNumero} · ${confirmCancelReserva.nombre} will be freed.`
              : `Mesa ${confirmCancelReserva.mesaNumero} · ${confirmCancelReserva.nombre} se libera.`}
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                void cancelarReserva(confirmCancelReservaId);
                setConfirmCancelReservaId(null);
              }}
              className="w-full rounded-full bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-600"
            >
              {locale === "en" ? "Yes, cancel" : "Sí, cancelar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancelReservaId(null)}
              className="w-full rounded-full border border-linea px-5 py-3 text-sm font-semibold text-carbon transition hover:bg-crema"
            >
              {locale === "en" ? "Keep it" : "Mantener"}
            </button>
          </div>
        </ModalShell>
      )}

      {sentarId && (
        <ModalShell
          onClose={() => {
            setSentarId(null);
            setSentarMesas([]);
          }}
          labelledBy="sentar-title"
        >
          <h2
            id="sentar-title"
            className="font-display text-xl uppercase tracking-tight text-carbon"
          >
            {locale === "en"
              ? `Seat ${sentarEspera?.nombre ?? ""}`
              : `Sentar a ${sentarEspera?.nombre ?? ""}`}
          </h2>
          <p className="mt-2 mb-1 text-sm text-carbon/55">
            {locale === "en"
              ? `Party of ${sentarEspera?.personas ?? "?"}. Tap one or more free tables.`
              : `Grupo de ${sentarEspera?.personas ?? "?"}. Tocá una o más mesas libres.`}
          </p>
          {(() => {
            const need = sentarEspera?.personas ?? 1;
            const selectedCap = mesas
              .filter((m) => sentarMesas.includes(m.numero))
              .reduce((s, m) => s + (m.capacidad ?? 4), 0);
            const ok = selectedCap >= need;
            return (
              <p
                className={`mb-3 text-sm font-semibold ${
                  ok ? "text-espera" : "text-amber-700"
                }`}
              >
                {locale === "en"
                  ? `${selectedCap} / ${need} seats selected`
                  : `${selectedCap} / ${need} plazas elegidas`}
                {sentarMesas.length > 1
                  ? locale === "en"
                    ? ` · tables ${sentarMesas.join("+")}`
                    : ` · mesas ${sentarMesas.join("+")}`
                  : ""}
              </p>
            );
          })()}
          <div className="mb-3 flex flex-wrap gap-3 text-[10px] font-semibold uppercase tracking-wide text-carbon/50">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-espera" />
              {locale === "en" ? "Free" : "Libre"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-amber-400" />
              {locale === "en" ? "Reserved" : "Reservada"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-rose-600" />
              {locale === "en" ? "Busy" : "Ocupada"}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {mesas.map((m) => {
              const libre = m.estado === "libre";
              const selected = sentarMesas.includes(m.numero);
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={!libre}
                  onClick={() => {
                    if (!libre) return;
                    setSentarMesas((prev) =>
                      prev.includes(m.numero)
                        ? prev.filter((n) => n !== m.numero)
                        : [...prev, m.numero].sort((a, b) => a - b),
                    );
                  }}
                  className={mesaTileClass(m.estado, {
                    pickable: libre,
                    selected: libre && selected,
                    tooSmall: false,
                  })}
                >
                  <span className="font-display text-xl leading-none">
                    {m.numero}
                  </span>
                  <span className="mt-1 text-[9px] font-bold uppercase tracking-wide opacity-90">
                    {libre
                      ? locale === "en"
                        ? "Free"
                        : "Libre"
                      : m.estado === "reservada"
                        ? "Res."
                        : locale === "en"
                          ? "Busy"
                          : "Ocup."}
                  </span>
                  <span className="mt-0.5 text-[9px] font-semibold opacity-80">
                    {m.capacidad ?? 4}p
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={
              !sentarMesas.length ||
              mesas
                .filter((m) => sentarMesas.includes(m.numero))
                .reduce((s, m) => s + (m.capacidad ?? 4), 0) <
                (sentarEspera?.personas ?? 1)
            }
            onClick={() => {
              if (!sentarId || !sentarMesas.length) return;
              void sentar(sentarId, sentarMesas).then(() => {
                const label = sentarMesas.join("+");
                setSentarId(null);
                setSentarMesas([]);
                toast(
                  locale === "en"
                    ? `Seated at table ${label}`
                    : `Sentados en mesa ${label}`,
                  "success",
                );
              });
            }}
            className="mt-4 w-full rounded-full bg-espera px-5 py-3.5 text-sm font-semibold text-crema transition hover:bg-espera-fuerte disabled:opacity-40"
          >
            {locale === "en" ? "Confirm seat" : "Confirmar asiento"}
          </button>
        </ModalShell>
      )}

      {liberarNumero != null && liberarMesaView && (
        <ModalShell
          onClose={() => setLiberarNumero(null)}
          labelledBy="liberar-title"
        >
          <h2
            id="liberar-title"
            className="font-display text-xl uppercase tracking-tight text-carbon"
          >
            {locale === "en"
              ? `Free table ${liberarNumero}?`
              : `¿Liberar mesa ${liberarNumero}?`}
          </h2>
          <p className="mt-2 text-sm text-carbon/60">
            {liberarMesaView.estado === "reservada"
              ? locale === "en"
                ? `Cancels the reservation${liberarReserva ? ` for ${liberarReserva.nombre}` : ""}.`
                : `Cancela la reserva${liberarReserva ? ` de ${liberarReserva.nombre}` : ""}.`
              : (() => {
                  const linked =
                    liberarMesaView.esperaId
                      ? mesas.filter(
                          (m) =>
                            m.esperaId === liberarMesaView.esperaId &&
                            m.estado === "ocupada",
                        )
                      : [liberarMesaView];
                  if (linked.length > 1) {
                    const nums = linked.map((m) => m.numero).join("+");
                    return locale === "en"
                      ? `Also frees joined tables ${nums}.`
                      : `También libera las mesas juntas ${nums}.`;
                  }
                  return locale === "en"
                    ? "Marks the table as free again."
                    : "La mesa vuelve a quedar libre.";
                })()}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                void liberarMesa(liberarNumero).then(() => {
                  setLiberarNumero(null);
                  toast(
                    locale === "en"
                      ? `Table ${liberarNumero} free`
                      : `Mesa ${liberarNumero} libre`,
                    "success",
                  );
                });
              }}
              className="w-full rounded-full bg-espera px-5 py-3.5 text-sm font-semibold text-crema transition hover:bg-espera-fuerte"
            >
              {locale === "en" ? "Yes, free it" : "Sí, liberar"}
            </button>
            <button
              type="button"
              onClick={() => setLiberarNumero(null)}
              className="w-full rounded-full border border-linea px-5 py-3.5 text-sm font-semibold text-carbon transition hover:bg-crema"
            >
              {locale === "en" ? "Back" : "Volver"}
            </button>
          </div>
        </ModalShell>
      )}

      {editCapacidadNumero != null && editCapacidadMesa && (
        <ModalShell
          onClose={() => setEditCapacidadNumero(null)}
          labelledBy="capacidad-title"
        >
          <h2
            id="capacidad-title"
            className="font-display text-xl uppercase tracking-tight text-carbon"
          >
            {locale === "en"
              ? `Table ${editCapacidadNumero} seats`
              : `Plazas mesa ${editCapacidadNumero}`}
          </h2>
          <p className="mt-2 text-sm text-carbon/55">
            {locale === "en"
              ? "How many guests fit at this table?"
              : "¿Cuántas personas entran en esta mesa?"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {CAPACIDADES_RAPIDAS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setEditCapacidadValue(n)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  editCapacidadValue === n
                    ? "bg-espera text-crema"
                    : "border border-linea text-carbon/70 hover:bg-crema"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <label className="mt-4 flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-carbon/70">
              {locale === "en" ? "Custom" : "Otro"}
            </span>
            <input
              type="number"
              min={1}
              max={50}
              className={INPUT}
              value={editCapacidadValue}
              onChange={(e) =>
                setEditCapacidadValue(Number(e.target.value) || 1)
              }
            />
          </label>
          <button
            type="button"
            onClick={() => {
              void setCapacidad(editCapacidadNumero, editCapacidadValue).then(
                () => {
                  setEditCapacidadNumero(null);
                  toast(
                    locale === "en"
                      ? `Table ${editCapacidadNumero}: ${editCapacidadValue} seats`
                      : `Mesa ${editCapacidadNumero}: ${editCapacidadValue} plazas`,
                    "success",
                  );
                },
              );
            }}
            className="mt-4 w-full rounded-full bg-espera px-5 py-3 text-sm font-semibold text-crema transition hover:bg-espera-fuerte"
          >
            {locale === "en" ? "Save" : "Guardar"}
          </button>
        </ModalShell>
      )}
    </div>
  );
};

export default EsperaPanelPage;

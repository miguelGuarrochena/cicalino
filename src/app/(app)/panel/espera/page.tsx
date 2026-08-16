"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { NotifyResult } from "@/lib/notify";
import Link from "next/link";
import { ModuleSwitcher } from "@/components/panel/ModuleSwitcher";
import { SyncErrorBanner } from "@/components/panel/SyncErrorBanner";
import { QrModal } from "@/components/panel/QrModal";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { Pagination, slicePage } from "@/components/ui/Pagination";
import { HelpLink } from "@/components/panel/HelpLink";
import { useApp } from "@/components/providers/Providers";
import { useWaitlist } from "@/lib/hooks/useWaitlist";
import { fetchEsperaSeen } from "@/lib/data/waitlist";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useToast } from "@/components/ui/Toast";
import { businessDayStart, TZ_NEGOCIO } from "@/lib/businessDay";
import {
  WAITLIST_STATUS_LABEL,
  waitlistClosed,
  tableNumbersLabel,
  tablesTitle,
  type WaitlistView,
  type ReservationView,
} from "@/lib/types";
import {
  HOLD_BEFORE_MIN,
  isReservationHolding,
  reservationTime,
  conflictingReservation,
  nextReservationByTable,
  tablesInFloorHold,
  occupiedBlocksSoonBooking,
  OCCUPIED_BOOKING_LEAD_MIN,
  earliestBookingAfterOccupied,
  timeUntilLabel,
  reservationDateKey,
} from "@/lib/reservations";
import {
  readDeviceMode,
  visibleModules,
} from "@/lib/modules";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { NumberStepper } from "@/components/panel/espera/NumberStepper";
import { PersonasChips } from "@/components/panel/espera/PersonasChips";
import { ReservaHorarioPicker } from "@/components/panel/espera/ReservaHorarioPicker";
import {
  AvisoReserva,
  AvisoBloqueoReserva,
} from "@/components/panel/espera/AvisoReserva";
import { ReservasAgenda } from "@/components/panel/espera/ReservasAgenda";
import { mesaTileClass } from "@/components/panel/espera/mesaTileClass";
import { motivoOcupar, motivoReserva } from "@/lib/espera/motivos";
import {
  minsAgo,
  formatHora,
  defaultHorarioInput,
  dateKeyFromLocal,
  timeKeyFromLocal,
} from "@/lib/espera/slots";
import { instantFromBusinessWallClock } from "@/lib/businessDay";

const PAGE_SIZE = 20;
const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none transition focus:border-espera focus:ring-2 focus:ring-espera/20 placeholder:text-carbon/40";

const BTN_MOBILE =
  "w-full rounded-full px-4 py-3.5 text-sm font-semibold transition active:scale-[0.98] sm:w-auto sm:px-4 sm:py-2.5";

const EsperaPanelPage = () => {
  const { locale } = useApp();
  const toast = useToast();
  const router = useRouter();
  const branchId = useSessionStore((s) => s.sucursalId);
  const activeEmployee = useSessionStore((s) => s.empleadoActivo);
  const tableCount = useConfigStore((s) => s.tableCount);
  const cutoffHour = useConfigStore((s) => s.cutoffHour);
  const reservaAbreMin = useConfigStore((s) => s.reservaAbreMin);
  const reservaCierraMin = useConfigStore((s) => s.reservaCierraMin);
  const diasCerrados = useConfigStore((s) => s.diasCerrados);
  const reservaHours = useMemo(
    () => ({
      startMin: reservaAbreMin,
      endMin: reservaCierraMin,
      closedWeekdays: diasCerrados,
    }),
    [reservaAbreMin, reservaCierraMin, diasCerrados],
  );
  const moduloPedidos = useConfigStore((s) => s.moduloPedidos);
  const moduloEspera = useConfigStore((s) => s.moduloEspera);
  const branchConfigReady = useConfigStore((s) => s.branchConfigReady);
  const dispositivo = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    readDeviceMode,
    () => "ambos" as const,
  );
  const visibles = visibleModules(
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
    reavisar,
    sentar,
    cancelar,
    borrarEspera,
    sentarReserva,
    cancelarReserva,
    liberarMesa,
    ocuparMesas,
    setCapacidad,
    syncError,
  } = useWaitlist(branchId);

  const [qr, setQr] = useState<WaitlistView | null>(null);
  /* true = alta nueva (cerrar al escanear). false = botón QR manual. */
  const [qrAutoClose, setQrAutoClose] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [reservaOpen, setReservaOpen] = useState(false);
  const [name, setNombre] = useState("");
  const [partySize, setPersonas] = useState(2);
  const [creating, setCreating] = useState(false);
  const [reservaNombre, setReservaNombre] = useState("");
  const [reservaPersonas, setReservaPersonas] = useState(2);
  /* Lo que el usuario tocó. Lo que vale es `reservaMesas`, más abajo: la
   * selección filtrada por lo que sigue estando disponible al horario
   * elegido. Se guardan separadas para no tener que corregir el estado
   * desde un efecto cada vez que cambia el horario. */
  const [reservaMesasElegidas, setReservaMesas] = useState<number[]>([]);
  const [reservaHorario, setReservaHorario] = useState(() =>
    defaultHorarioInput(),
  );
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
  const [ocuparOpen, setOcuparOpen] = useState(false);
  const [ocuparMesasSel, setOcuparMesasSel] = useState<number[]>([]);
  const [ocuparPrimaria, setOcuparPrimaria] = useState<number | null>(null);
  const [ocuparNombre, setOcuparNombre] = useState("");
  const [ocuparPersonas, setOcuparPersonas] = useState(2);
  const [holdReservaId, setHoldReservaId] = useState<string | null>(null);
  const [ocupando, setOcupando] = useState(false);
  const [filtroMesa, setFiltroMesa] = useState<
    "todas" | "libre" | "conReserva" | "ocupada"
  >("todas");
  const [qMesa, setQMesa] = useState("");
  const [page, setPage] = useState(1);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const iv = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!branchConfigReady) return;
    if (!visibles.espera && visibles.pedidos) router.replace("/panel");
    if (!visibles.espera && !visibles.pedidos) router.replace("/panel");
  }, [branchConfigReady, visibles, router]);

  /* Cerrar el QR al escanear solo en el alta (`qrAutoClose`).
   * El botón "QR" reabre el código aunque ya lo hayan visto; cerrar el
   * modal no cancela la espera. */
  const qrVisto = qr
    ? Boolean(esperas.find((e) => e.id === qr.id)?.seenAt)
    : false;

  useEffect(() => {
    if (!qr || !qrAutoClose || qrVisto) return;
    let vivo = true;
    const check = () => {
      void fetchEsperaSeen(qr.id).then((visto) => {
        if (vivo && visto) setQr(null);
      });
    };
    check();
    const iv = window.setInterval(check, 1_200);
    return () => {
      vivo = false;
      window.clearInterval(iv);
    };
  }, [qr, qrAutoClose, qrVisto]);

  const toastAviso = useCallback(
    (r: NotifyResult | null) => {
      if (!r) return;
      if (!r.ok) {
        toast(
          locale === "en"
            ? "Couldn’t notify. Check the connection and try again."
            : "No se pudo avisar. Revisá la conexión y probá de nuevo.",
          "error",
        );
        return;
      }
      if (r.delivered > 0) {
        toast(locale === "en" ? "Notified 🔔" : "Avisado 🔔", "success");
        return;
      }
      toast(
        locale === "en"
          ? "Marked as notified, but their phone has no alerts on — call them out."
          : "Marcado como avisado, pero el celular no tiene avisos activos: llamalo vos.",
        "info",
      );
    },
    [locale, toast],
  );

  const cola = useMemo(
    () =>
      esperas
        .filter((e) => e.status === "esperando" || e.status === "avisado")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [esperas],
  );
  const canceladasHoy = useMemo(() => {
    const desde = businessDayStart(cutoffHour).toISOString();
    return esperas
      .filter(
        (e) =>
          e.status === "cancelado" &&
          (e.cancelledAt ?? e.createdAt) >= desde,
      )
      .sort((a, b) =>
        (b.cancelledAt ?? b.createdAt).localeCompare(
          a.cancelledAt ?? a.createdAt,
        ),
      );
  }, [esperas, cutoffHour]);
  const reservasActivas = useMemo(
    () => reservas.filter((r) => r.status === "activa"),
    [reservas],
  );
  /* Agenda also keeps no-shows / closed bookings for the day (claims). */
  const reservasAgenda = useMemo(
    () =>
      reservas.filter(
        (r) =>
          r.status === "activa" ||
          r.status === "expirada" ||
          r.status === "sentada" ||
          r.status === "cancelada",
      ),
    [reservas],
  );
  const reservaById = useMemo(() => {
    const map = new Map<string, ReservationView>();
    for (const r of reservas) map.set(r.id, r);
    return map;
  }, [reservas]);
  const esperaById = useMemo(() => {
    const map = new Map<string, WaitlistView>();
    for (const e of esperas) map.set(e.id, e);
    return map;
  }, [esperas]);

  /* Floor hold + map chips: only TODAY’s bookings. A reservation two days out
   * still lives in the agenda/calendar — putting “14:00” on the floor map with
   * no date made staff think it was tonight. */
  const hoyKey = reservationDateKey(new Date(ahora).toISOString(), TZ_NEGOCIO);
  const reservasHoyMapa = useMemo(
    () =>
      reservas.filter(
        (r) => reservationDateKey(r.scheduledAt, TZ_NEGOCIO) === hoyKey,
      ),
    [reservas, hoyKey],
  );

  const mesaTomadaPorReserva = useMemo(
    () => tablesInFloorHold(reservasHoyMapa, ahora),
    [reservasHoyMapa, ahora],
  );

  const reservaPorMesa = useMemo(
    () => nextReservationByTable(reservasHoyMapa, ahora),
    [reservasHoyMapa, ahora],
  );

  const libres = mesas.filter((m) => m.status === "libre").length;
  const ocupadas = mesas.filter((m) => m.status === "ocupada").length;
  const conReserva = mesas.filter((m) => reservaPorMesa.has(m.number)).length;
  const personasEnCola = cola.reduce((sum, e) => sum + e.partySize, 0);
  const mesasFiltradas = useMemo(() => {
    const needle = qMesa.trim().toLowerCase();
    return mesas.filter((m) => {
      if (filtroMesa === "conReserva" && !reservaPorMesa.has(m.number)) {
        return false;
      }
      if (
        (filtroMesa === "libre" || filtroMesa === "ocupada") &&
        m.status !== filtroMesa
      ) {
        return false;
      }
      if (!needle) return true;
      if (String(m.number).includes(needle)) return true;
      const reserva = reservaPorMesa.get(m.number);
      if (reserva?.name.toLowerCase().includes(needle)) return true;
      const espera =
        m.waitlistId != null ? esperaById.get(m.waitlistId) : undefined;
      if (espera?.name.toLowerCase().includes(needle)) return true;
      const sentada =
        m.reservationId != null ? reservaById.get(m.reservationId) : undefined;
      if (sentada?.name.toLowerCase().includes(needle)) return true;
      return false;
    });
  }, [mesas, filtroMesa, qMesa, reservaPorMesa, reservaById, esperaById]);
  const paginated = slicePage(cola, page, PAGE_SIZE);
  const sentarEspera = esperas.find((e) => e.id === sentarId);
  const mesasLibres = mesas.filter((m) => m.status === "libre");
  const reservaHorarioIso = useMemo(() => {
    const d = new Date(reservaHorario);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }, [reservaHorario]);
  const reservaChoquePorMesa = useMemo(() => {
    const map = new Map<number, ReservationView>();
    if (!reservaHorarioIso) return map;
    for (const m of mesas) {
      const choque = conflictingReservation(
        [m.number],
        reservaHorarioIso,
        reservas,
      );
      if (choque) map.set(m.number, choque);
    }
    return map;
  }, [mesas, reservas, reservaHorarioIso]);
  const reservaOcupadaPronto = useMemo(() => {
    const set = new Set<number>();
    if (!reservaHorarioIso) return set;
    for (const m of mesas) {
      if (
        occupiedBlocksSoonBooking(reservaHorarioIso, m.status, ahora)
      ) {
        set.add(m.number);
      }
    }
    return set;
  }, [mesas, reservaHorarioIso, ahora]);
  const reservaDesdeOcupada = useMemo(
    () => reservationTime(earliestBookingAfterOccupied(ahora).toISOString()),
    [ahora],
  );
  /* Si cambió el horario y una mesa elegida ahora choca o está ocupada
   * demasiado pronto, deja de contar: si no, el botón queda disabled con la
   * mesa "seleccionada" invisible y parece que no marca nada.
   *
   * Se descarta acá, al derivar, en vez de corregir el estado desde un efecto.
   * Hace lo mismo en un solo render en vez de dos, y no hay un instante en el
   * que la pantalla muestre una selección que ya no vale. */
  const reservaMesas = reservaMesasElegidas.filter(
    (n) => !reservaChoquePorMesa.has(n) && !reservaOcupadaPronto.has(n),
  );
  const mesasParaReserva = mesas.filter(
    (m) =>
      !reservaChoquePorMesa.has(m.number) &&
      !reservaOcupadaPronto.has(m.number),
  );
  const reservaCapSeleccionada = mesas
    .filter((m) => reservaMesas.includes(m.number))
    .reduce((s, m) => s + (m.capacity ?? 4), 0);
  const reservaCapLibre = mesasParaReserva.reduce(
    (s, m) => s + (m.capacity ?? 4),
    0,
  );
  const reservaPuedeCubrir = reservaCapLibre >= reservaPersonas;
  const reservaMesasOk =
    reservaMesas.length > 0 && reservaCapSeleccionada >= reservaPersonas;
  const reservaFaltan = Math.max(0, reservaPersonas - reservaCapSeleccionada);
  const reservaMaxMesaLibre = mesasParaReserva.reduce(
    (max, m) => Math.max(max, m.capacity ?? 4),
    0,
  );
  const reservaCabeEnUna = reservaMaxMesaLibre >= reservaPersonas;
  const ocuparCap = mesas
    .filter((m) => ocuparMesasSel.includes(m.number))
    .reduce((s, m) => s + (m.capacity ?? 4), 0);
  const ocuparFaltan = Math.max(0, ocuparPersonas - ocuparCap);
  const ocuparBloqueadas = ocuparMesasSel.filter((n) =>
    mesaTomadaPorReserva.has(n),
  );
  const ocuparOk =
    ocuparMesasSel.length > 0 &&
    ocuparCap >= ocuparPersonas &&
    ocuparBloqueadas.length === 0;
  const ocuparPrimariaMesa =
    ocuparPrimaria != null
      ? mesas.find((m) => m.number === ocuparPrimaria)
      : undefined;
  const ocuparNecesitaMapa = ocuparMesasSel.length > 0 && !ocuparOk;
  const ocuparAvisos = ocuparMesasSel
    .map((n) => ({ number: n, reserva: reservaPorMesa.get(n) }))
    .filter(
      (x): x is { number: number; reserva: ReservationView } => x.reserva != null,
    )
    .sort((a, b) => a.reserva.scheduledAt.localeCompare(b.reserva.scheduledAt));
  const sentarAvisos = sentarMesas
    .map((n) => ({ number: n, reserva: reservaPorMesa.get(n) }))
    .filter(
      (x): x is { number: number; reserva: ReservationView } => x.reserva != null,
    )
    .sort((a, b) => a.reserva.scheduledAt.localeCompare(b.reserva.scheduledAt));
  const confirmCancelEspera = esperas.find(
    (e) => e.id === confirmCancelEsperaId,
  );
  const confirmCancelReserva = reservas.find(
    (r) => r.id === confirmCancelReservaId,
  );
  /* Si la reserva dejó de estar activa —la sentó otra caja, la canceló el
   * cron— `holdReserva` queda undefined y el panel de abajo no se muestra.
   *
   * Antes había además un efecto que ponía el id en null. No hacía falta: el
   * render ya dependía de encontrar la reserva, así que el efecto solo
   * limpiaba un id que nadie miraba, a costa de un render extra. */
  const holdReserva = holdReservaId
    ? reservasActivas.find((r) => r.id === holdReservaId)
    : undefined;
  const editCapacidadMesa = mesas.find((m) => m.number === editCapacidadNumero);
  const liberarMesaView = mesas.find((m) => m.number === liberarNumero);
  const liberarReserva =
    liberarMesaView?.reservationId != null
      ? reservaById.get(liberarMesaView.reservationId)
      : undefined;
  const liberarEspera =
    liberarMesaView?.waitlistId != null
      ? esperaById.get(liberarMesaView.waitlistId)
      : undefined;
  const liberarGrupoMesas =
    liberarMesaView?.status === "ocupada"
      ? mesas
          .filter((m) => {
            if (m.status !== "ocupada") return false;
            if (
              liberarMesaView.waitlistId &&
              m.waitlistId === liberarMesaView.waitlistId
            ) {
              return true;
            }
            if (
              liberarMesaView.reservationId &&
              m.reservationId === liberarMesaView.reservationId
            ) {
              return true;
            }
            return m.number === liberarMesaView.number;
          })
          .map((m) => m.number)
          .sort((a, b) => a - b)
      : liberarNumero != null
        ? [liberarNumero]
        : [];
  const liberarGrupoLabel = tableNumbersLabel(liberarGrupoMesas);
  const liberarGrupoTitulo = tablesTitle(
    liberarGrupoMesas,
    locale === "en" ? "en" : "es",
  );
  const liberarTieneGrupo = liberarGrupoMesas.length > 1;
  const CAPACIDADES_RAPIDAS = [2, 4, 6, 8, 10] as const;

  const hayMesaPara = (personasGrupo: number) => {
    const libresCap = mesas
      .filter((m) => m.status === "libre")
      .map((m) => m.capacity ?? 4)
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
    ? { id: activeEmployee.id, name: activeEmployee.name }
    : null;

  const onCrear = async () => {
    if (creating) return;
    if (!name.trim()) {
      toast(locale === "en" ? "Enter a name" : "Ingresá un nombre", "error");
      return;
    }
    setCreating(true);
    try {
      const created = await crearEspera(name, partySize, employeeRef);
      if (created) {
        setQrAutoClose(true);
        setQr(created);
        setCreateOpen(false);
        setNombre("");
        setPersonas(2);
        toast(
          locale === "en" ? "Added to waitlist" : "Agregado a la lista",
          "success",
        );
      } else {
        toast(
          locale === "en"
            ? "Couldn’t add the party. Check the connection and try again."
            : "No se pudo agregar el grupo. Revisá la conexión y probá de nuevo.",
          "error",
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
    if (!reservaMesasOk) {
      const msg = !mesasParaReserva.length
        ? locale === "en"
          ? reservaOcupadaPronto.size && !reservaChoquePorMesa.size
            ? `Busy tables can’t take a booking before ${reservaDesdeOcupada}`
            : "Every table is already booked around that time"
          : reservaOcupadaPronto.size && !reservaChoquePorMesa.size
            ? `Mesas ocupadas: no se puede reservar antes de las ${reservaDesdeOcupada}`
            : "Todas las mesas ya tienen reserva a esa hora"
        : !reservaPuedeCubrir
          ? locale === "en"
            ? `Not enough seats for ${reservaPersonas} at that time (only ${reservaCapLibre} available)`
            : `No alcanzan las plazas para ${reservaPersonas} a esa hora (hay ${reservaCapLibre})`
          : reservaMesas.length === 0
            ? reservaCabeEnUna
              ? locale === "en"
                ? `Pick a table for ${reservaPersonas} people`
                : `Elegí una mesa para ${reservaPersonas} personas`
              : locale === "en"
                ? `Party of ${reservaPersonas} needs 2+ tables`
                : `Grupo de ${reservaPersonas}: elegí 2 o más mesas`
            : locale === "en"
              ? `Still short ${reservaFaltan} seat${reservaFaltan === 1 ? "" : "s"} — join another table`
              : `Faltan ${reservaFaltan} plaza${reservaFaltan === 1 ? "" : "s"}: juntá otra mesa`;
      toast(msg, "error");
      return;
    }
    /* El picker devuelve "2026-08-09T21:00", sin offset. `new Date(...)` lo
     * leía como hora local del dispositivo, mientras la agenda siempre mostró
     * en hora argentina: en una tablet con la zona mal puesta la reserva se
     * guardaba en un instante y aparecía en otro. Se arma en la zona del
     * negocio, que es la que el local tiene en la cabeza. */
    const scheduledAt = instantFromBusinessWallClock(
      dateKeyFromLocal(reservaHorario),
      timeKeyFromLocal(reservaHorario),
    );
    if (!scheduledAt) {
      toast(locale === "en" ? "Invalid time" : "Horario inválido", "error");
      return;
    }
    setCreatingReserva(true);
    try {
      const created = await crearReserva({
        name: reservaNombre,
        partySize: reservaPersonas,
        tableNumbers: reservaMesas,
        scheduledAt: scheduledAt.toISOString(),
        graceMinutes: reservaGracia,
        employee: employeeRef,
      });
      if (created.ok) {
        setReservaOpen(false);
        setReservaNombre("");
        setReservaPersonas(2);
        setReservaMesas([]);
        setReservaHorario(defaultHorarioInput(reservaHours));
        setReservaGracia(15);
        const label = tablesTitle(
          created.reserva.tableNumbers,
          locale === "en" ? "en" : "es",
        );
        toast(
          locale === "en" ? `${label} reserved` : `${label} reservada`,
          "success",
        );
      } else {
        toast(motivoReserva(created.reason, locale), "error");
      }
    } finally {
      setCreatingReserva(false);
    }
  };

  if (!visibles.espera) return null;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <ModuleSwitcher />
      <SyncErrorBanner error={syncError} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-espera">
              {locale === "en" ? "Table wait" : "Espera de mesa"}
            </p>
            <HelpLink seccion="espera" accent="espera" />
          </div>
          <h1 className="font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
            {locale === "en" ? "Floor & waitlist" : "Sala y lista de espera"}
          </h1>
          <p className="mt-1 text-sm text-carbon/55">
            {cola.length}{" "}
            {locale === "en" ? "parties waiting" : "grupos esperando"}
            {personasEnCola
              ? ` · ${personasEnCola} ${locale === "en" ? "guests" : "personas"}`
              : ""}
            {tableCount ? ` · ${tableCount} mesas` : ""}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={() => {
              setReservaMesas([]);
              setReservaHorario(defaultHorarioInput(reservaHours));
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

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() =>
            setFiltroMesa((f) => (f === "libre" ? "todas" : "libre"))
          }
          className={`rounded-2xl border px-3 py-3 text-left transition ${
            filtroMesa === "libre"
              ? "border-espera bg-espera/15"
              : "border-linea bg-surface hover:bg-carbon/5"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-espera">
            {locale === "en" ? "Free" : "Libres"}
          </p>
          <p className="mt-0.5 font-display text-2xl text-espera">{libres}</p>
        </button>
        <button
          type="button"
          onClick={() =>
            setFiltroMesa((f) => (f === "conReserva" ? "todas" : "conReserva"))
          }
          className={`rounded-2xl border px-3 py-3 text-left transition ${
            filtroMesa === "conReserva"
              ? "border-amber-500 bg-amber-100"
              : "border-linea bg-surface hover:bg-carbon/5"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900">
            {locale === "en" ? "With booking" : "Con reserva"}
          </p>
          <p className="mt-0.5 font-display text-2xl text-amber-900">
            {conReserva}
          </p>
        </button>
        <button
          type="button"
          onClick={() =>
            setFiltroMesa((f) => (f === "ocupada" ? "todas" : "ocupada"))
          }
          className={`rounded-2xl border px-3 py-3 text-left transition ${
            filtroMesa === "ocupada"
              ? "border-rose-500 bg-rose-100"
              : "border-linea bg-surface hover:bg-carbon/5"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-800">
            {locale === "en" ? "Busy" : "Ocupadas"}
          </p>
          <p className="mt-0.5 font-display text-2xl text-rose-800">{ocupadas}</p>
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {(
            [
              ["todas", locale === "en" ? "All" : "Todas", mesas.length],
              ["libre", locale === "en" ? "Free" : "Libres", libres],
              [
                "conReserva",
                locale === "en" ? "With booking" : "Con reserva",
                conReserva,
              ],
              ["ocupada", locale === "en" ? "Busy" : "Ocupadas", ocupadas],
            ] as const
          ).map(([key, label, n]) => {
            const active = filtroMesa === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFiltroMesa(key)}
                className={`flex min-h-11 shrink-0 items-center justify-center rounded-full px-4 text-sm font-semibold transition sm:min-h-0 sm:px-3.5 sm:py-2 ${
                  active
                    ? "bg-espera text-crema"
                    : "border border-linea bg-surface text-carbon/60 hover:bg-carbon/5"
                }`}
              >
                {label}
                <span className={`ml-1.5 ${active ? "opacity-80" : "opacity-50"}`}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={qMesa}
          onChange={(e) => setQMesa(e.target.value)}
          placeholder={
            locale === "en"
              ? "Search table nº or name…"
              : "Buscar mesa nº o apellido…"
          }
          className={INPUT}
        />
        <p className="text-xs text-carbon/45">
          {locale === "en"
            ? `Tap free → seat · busy → free. Amber = today’s booking (${HOLD_BEFORE_MIN} min before until grace). Later days stay in the calendar.`
            : `Libre → sentar · ocupada → liberar. Ámbar = reserva de hoy (${HOLD_BEFORE_MIN} min antes hasta la tolerancia). Otros días solo en el calendario.`}
        </p>
      </div>

      <section className="rounded-[24px] border border-espera/20 bg-surface p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap gap-3 text-[10px] font-semibold uppercase tracking-wide text-carbon/50">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-espera" />
            {locale === "en" ? "Free" : "Libre"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border-2 border-amber-500 bg-espera" />
            {locale === "en" ? "Free · booked later" : "Libre · con reserva"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-amber-400" />
            {locale === "en" ? "Reserved now" : "Reservada ahora"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-rose-600" />
            {locale === "en" ? "Busy" : "Ocupada"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border-2 border-amber-500 bg-rose-600" />
            {locale === "en" ? "Busy · booked later" : "Ocup. · con reserva"}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
          {mesasFiltradas.map((m) => {
            const espera =
              m.waitlistId != null ? esperaById.get(m.waitlistId) : undefined;
            const reservaSentada =
              m.reservationId != null ? reservaById.get(m.reservationId) : undefined;
            const libre = m.status === "libre";
            const reservaProx = reservaPorMesa.get(m.number);
            const holding = reservaProx
              ? isReservationHolding(reservaProx, ahora)
              : false;
            const conReserva = !!reservaProx && !holding;
            const etiquetaGrupo = libre
              ? reservaProx?.name
              : (espera?.name ?? reservaSentada?.name);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  if (libre && holding && reservaProx) {
                    setHoldReservaId(reservaProx.id);
                    return;
                  }
                  if (libre) {
                    setOcuparPrimaria(m.number);
                    setOcuparMesasSel([m.number]);
                    setOcuparNombre("");
                    setOcuparPersonas(Math.min(m.capacity ?? 4, 4));
                    setOcuparOpen(true);
                    return;
                  }
                  setLiberarNumero(m.number);
                }}
                title={
                  reservaProx
                    ? libre
                      ? holding
                        ? locale === "en"
                          ? `Reserved ${reservationTime(reservaProx.scheduledAt)} — ${reservaProx.name} · tap to manage`
                          : `Reservada ${reservationTime(reservaProx.scheduledAt)} — ${reservaProx.name} · tocar para gestionar`
                        : locale === "en"
                          ? `Free now · booking ${reservationTime(reservaProx.scheduledAt)} (${reservaProx.name})`
                          : `Libre ahora · reserva ${reservationTime(reservaProx.scheduledAt)} (${reservaProx.name})`
                      : locale === "en"
                        ? `Busy · booking ${reservationTime(reservaProx.scheduledAt)} (${reservaProx.name}) — tap to free`
                        : `Ocupada · reserva ${reservationTime(reservaProx.scheduledAt)} (${reservaProx.name}) — tocar para liberar`
                    : libre
                      ? locale === "en"
                        ? "Tap to seat now"
                        : "Tocar para sentar"
                      : locale === "en"
                        ? "Tap to free"
                        : "Tocar para liberar"
                }
                className={mesaTileClass(m.status, {
                  pickable: true,
                  conReserva,
                  reservaHold: holding,
                })}
              >
                {reservaProx && (
                  <span
                    className={`absolute -top-1.5 left-1/2 z-10 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none shadow-sm ${
                      holding
                        ? "bg-amber-950 text-amber-100"
                        : "bg-amber-400 text-amber-950"
                    }`}
                  >
                    {reservationTime(reservaProx.scheduledAt)}
                  </span>
                )}
                <span className="font-display text-lg leading-none">
                  {m.number}
                </span>
                <span className="mt-1 text-[10px] font-bold uppercase tracking-wide opacity-90">
                  {holding
                    ? locale === "en"
                      ? "Booked"
                      : "Reserva"
                    : libre
                      ? locale === "en"
                        ? "Free"
                        : "Libre"
                      : locale === "en"
                        ? "Busy"
                        : "Ocup."}
                </span>
                <span className="mt-0.5 text-[9px] font-semibold opacity-80">
                  {m.capacity ?? 4}p
                </span>
                {(etiquetaGrupo || (reservaProx && !libre)) && (
                  <span className="mt-0.5 max-w-full truncate px-1 text-[9px] font-medium opacity-80">
                    {!libre && reservaProx
                      ? `${etiquetaGrupo ? `${etiquetaGrupo} · ` : ""}${reservationTime(reservaProx.scheduledAt)}`
                      : etiquetaGrupo}
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
          {!!mesas.length && !mesasFiltradas.length && (
            <p className="col-span-full py-6 text-center text-sm text-carbon/50">
              {locale === "en"
                ? "No tables match this filter."
                : "Ninguna mesa con este filtro."}
            </p>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-carbon/70">
            {locale === "en" ? "Waiting list" : "Lista de espera"}
            {cola.length ? ` · ${cola.length}` : ""}
          </h2>
          {cola.length > 0 && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-espera px-4 text-sm font-semibold text-crema shadow-sm transition hover:bg-espera-fuerte sm:min-h-0 sm:py-2"
            >
              {locale === "en" ? "+ Add party" : "+ Agregar grupo"}
            </button>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {paginated.map((e, idx) => {
            const mins = minsAgo(e.createdAt);
            const urgencia =
              mins >= 20 ? "text-rose-600" : mins >= 10 ? "text-amber-700" : "";
            const pos = (page - 1) * PAGE_SIZE + idx + 1;
            const puedeSentar = hayMesaPara(e.partySize);
            return (
            <article
              key={e.id}
              className={`rounded-[20px] border bg-surface p-4 shadow-sm ${
                e.status === "avisado"
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
                      {e.name}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        e.status === "avisado"
                          ? "bg-espera text-crema"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {WAITLIST_STATUS_LABEL[e.status]}
                    </span>
                  </div>
                  <p className={`mt-1 text-sm text-carbon/55 ${urgencia}`}>
                    {e.partySize} {locale === "en" ? "guests" : "personas"} ·{" "}
                    <span className="font-semibold">{mins} min</span>
                    {e.employee ? ` · ${e.employee}` : ""}
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[9.5rem] sm:flex-row sm:flex-wrap">
                  {e.status === "esperando" && (
                    <button
                      type="button"
                      onClick={() => void avisar(e.id).then(toastAviso)}
                      className={`${BTN_MOBILE} bg-espera text-crema hover:bg-espera-fuerte sm:flex-1`}
                    >
                      {locale === "en" ? "Notify" : "Avisar"}
                    </button>
                  )}
                  {e.status === "avisado" && (
                    <button
                      type="button"
                      onClick={() => {
                        void reavisar(e.id).then((r) => toastAviso(r));
                      }}
                      className={`${BTN_MOBILE} border border-espera/40 bg-espera/10 text-espera hover:bg-espera hover:text-crema sm:flex-1`}
                    >
                      {locale === "en" ? "Notify again 🔔" : "Volver a avisar 🔔"}
                    </button>
                  )}
                  {(e.status === "esperando" || e.status === "avisado") && (
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
                      onClick={() => {
                        setQrAutoClose(false);
                        setQr(e);
                      }}
                      className={`${BTN_MOBILE} flex-1 border border-linea text-carbon/70 hover:bg-crema`}
                    >
                      QR
                    </button>
                    {!waitlistClosed(e.status) && (
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
                  ? "Add a party when walk-ins arrive."
                  : "Agregá un grupo cuando lleguen sin reserva."}
              </p>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="mt-5 inline-flex min-h-11 w-full max-w-xs items-center justify-center rounded-full bg-espera px-5 text-sm font-semibold text-crema shadow-sm transition hover:bg-espera-fuerte sm:w-auto"
              >
                {locale === "en" ? "+ Add party" : "+ Agregar grupo"}
              </button>
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

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-carbon/70">
              {locale === "en" ? "Reservations" : "Reservas"}
              {reservasActivas.length
                ? ` · ${reservasActivas.length}`
                : ""}
            </h2>
            {reservasAgenda.length > 0 && (
              <p className="mt-0.5 text-xs text-carbon/45">
                {locale === "en"
                  ? "Unfulfilled bookings stay in the day log."
                  : "Si no llegan, quedan como «No cumplida» en el historial."}
              </p>
            )}
          </div>
          {reservasAgenda.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setReservaMesas([]);
                setReservaHorario(defaultHorarioInput(reservaHours));
                setReservaOpen(true);
              }}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-espera/40 bg-espera/10 px-4 text-sm font-semibold text-espera transition hover:bg-espera hover:text-crema sm:min-h-0 sm:py-2"
            >
              {locale === "en" ? "+ Reservation" : "+ Reserva"}
            </button>
          )}
        </div>
        {reservasAgenda.length > 0 ? (
          <ReservasAgenda
            reservas={reservasAgenda}
            locale={locale}
            ahora={ahora}
            onSentar={(id) => {
              void sentarReserva(id).then(() => {
                const r = reservasActivas.find((x) => x.id === id);
                setHoldReservaId(null);
                toast(
                  locale === "en"
                    ? `Seated at ${tablesTitle(r?.tableNumbers ?? [r?.tableNumber ?? 0], "en")}`
                    : `Sentados en ${tablesTitle(r?.tableNumbers ?? [r?.tableNumber ?? 0], "es")}`,
                  "success",
                );
              });
            }}
            onCancelar={(id) => {
              setHoldReservaId(null);
              setConfirmCancelReservaId(id);
            }}
          />
        ) : (
          <div className="rounded-[24px] border border-dashed border-espera/30 bg-espera/5 px-6 py-10 text-center">
            <p className="font-display text-lg uppercase text-espera">
              {locale === "en" ? "No reservations yet" : "Sin reservas todavía"}
            </p>
            <p className="mt-1 text-sm text-carbon/50">
              {locale === "en"
                ? "Book a table for later from here."
                : "Reservá una mesa para más tarde desde acá."}
            </p>
            <button
              type="button"
              onClick={() => {
                setReservaMesas([]);
                setReservaHorario(defaultHorarioInput(reservaHours));
                setReservaOpen(true);
              }}
              className="mt-5 inline-flex min-h-11 w-full max-w-xs items-center justify-center rounded-full border border-espera/40 bg-espera/10 px-5 text-sm font-semibold text-espera transition hover:bg-espera hover:text-crema sm:w-auto"
            >
              {locale === "en" ? "+ Reservation" : "+ Reserva"}
            </button>
          </div>
        )}
      </section>

      {canceladasHoy.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-carbon/70">
            {locale === "en" ? "Cancelled today" : "Cancelados hoy"}
            {` · ${canceladasHoy.length}`}
          </h2>
          <div className="flex flex-col gap-2">
            {canceladasHoy.slice(0, 8).map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-linea bg-surface/70 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-carbon/70">
                    {e.name}
                  </p>
                  <p className="text-xs text-carbon/45">
                    {e.partySize}{" "}
                    {locale === "en" ? "guests" : "personas"}
                    {e.cancelledAt
                      ? ` · ${formatHora(e.cancelledAt, locale)}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700">
                    {WAITLIST_STATUS_LABEL.cancelado}
                  </span>
                  <button
                    type="button"
                    aria-label={locale === "en" ? "Delete" : "Borrar"}
                    title={locale === "en" ? "Delete" : "Borrar"}
                    onClick={() => {
                      void borrarEspera(e.id);
                      toast(
                        locale === "en" ? "Removed" : "Eliminado",
                        "success",
                      );
                    }}
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-linea text-carbon/40 transition hover:border-red-300 hover:text-red-500"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-center text-xs text-carbon/45">
        {locale === "en"
          ? "How does this screen work?"
          : "¿Cómo funciona esta pantalla?"}{" "}
        <Link
          href="/panel/ayuda#espera"
          className="font-semibold text-espera underline-offset-2 hover:underline"
        >
          {locale === "en" ? "Help" : "Ayuda"}
        </Link>
      </p>

      {qr && !(qrAutoClose && qrVisto) && (
        <QrModal
          reference={qr.name}
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
          busy={creating}
          busyLabel={locale === "en" ? "Creating…" : "Creando…"}
          footer={
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={creating || !name.trim()}
                onClick={() => void onCrear()}
                className="w-full rounded-full bg-espera px-5 py-3.5 text-sm font-semibold text-crema transition hover:bg-espera-fuerte disabled:opacity-60"
              >
                {creating
                  ? "…"
                  : locale === "en"
                    ? "Create & show QR"
                    : "Crear y mostrar QR"}
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
                className="w-full rounded-full border border-linea px-5 py-3.5 text-sm font-semibold text-carbon transition hover:bg-crema disabled:opacity-60"
              >
                {locale === "en" ? "Cancel" : "Cancelar"}
              </button>
            </div>
          }
        >
          <div className="flex items-start justify-between gap-3">
            <h2
              id="espera-crear-title"
              className="font-display text-xl uppercase tracking-tight text-carbon"
            >
              {locale === "en" ? "Add to waitlist" : "Agregar a la espera"}
            </h2>
            <ModalCloseBtn
              disabled={creating}
              onClick={() => setCreateOpen(false)}
              label={locale === "en" ? "Close" : "Cerrar"}
            />
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-carbon/70">
                {locale === "en" ? "Name" : "Nombre"}
              </span>
              <input
                className={INPUT}
                value={name}
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
              <PersonasChips value={partySize} onChange={setPersonas} />
            </div>
          </div>
        </ModalShell>
      )}

      {reservaOpen && (
        <ModalShell
          onClose={() => {
            if (!creatingReserva) setReservaOpen(false);
          }}
          labelledBy="reserva-crear-title"
          busy={creatingReserva}
          busyLabel={locale === "en" ? "Saving…" : "Guardando…"}
          footer={
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={creatingReserva || !reservaMesasOk}
                onClick={() => void onCrearReserva()}
                className="w-full rounded-full bg-espera px-5 py-3.5 text-sm font-semibold text-crema transition hover:bg-espera-fuerte disabled:opacity-60"
              >
                {creatingReserva
                  ? "…"
                  : locale === "en"
                    ? "Save reservation"
                    : "Guardar reserva"}
              </button>
              <button
                type="button"
                disabled={creatingReserva}
                onClick={() => setReservaOpen(false)}
                className="w-full rounded-full border border-linea px-5 py-3.5 text-sm font-semibold text-carbon transition hover:bg-crema disabled:opacity-60"
              >
                {locale === "en" ? "Cancel" : "Cancelar"}
              </button>
            </div>
          }
        >
          <div className="flex items-start justify-between gap-3">
            <h2
              id="reserva-crear-title"
              className="font-display text-xl uppercase tracking-tight text-carbon"
            >
              {locale === "en" ? "New reservation" : "Nueva reserva"}
            </h2>
            <ModalCloseBtn
              disabled={creatingReserva}
              onClick={() => setReservaOpen(false)}
              label={locale === "en" ? "Close" : "Cerrar"}
            />
          </div>
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
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-carbon/70">
                {locale === "en" ? "Date & time" : "Día y hora"}
              </span>
              <ReservaHorarioPicker
                value={reservaHorario}
                onChange={setReservaHorario}
                locale={locale}
                hours={reservaHours}
              />
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-carbon/70">
                {locale === "en" ? "Table" : "Mesa"}
              </legend>
              <p className="mb-2 text-xs text-carbon/45">
                {locale === "en"
                  ? reservaCabeEnUna
                    ? `Pick a table that fits. Busy tables need +${OCCUPIED_BOOKING_LEAD_MIN} min (from ${reservaDesdeOcupada}).`
                    : `No single table fits — join 2 or more. Busy tables need +${OCCUPIED_BOOKING_LEAD_MIN} min.`
                  : reservaCabeEnUna
                    ? `Elegí una mesa que entre al grupo. Si está ocupada ahora, recién desde las ${reservaDesdeOcupada} (+${OCCUPIED_BOOKING_LEAD_MIN} min).`
                    : `Ninguna mesa sola alcanza: juntá 2 o más. Ocupadas: recién desde las ${reservaDesdeOcupada}.`}
              </p>
              {!mesas.length ? (
                <p className="mb-3 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 dark:bg-amber-400/15 dark:text-amber-100">
                  {locale === "en" ? (
                    <>
                      No tables configured. Set the table count in{" "}
                      <Link
                        href="/panel/config"
                        className="underline underline-offset-2"
                      >
                        Settings
                      </Link>{" "}
                      and save.
                    </>
                  ) : (
                    <>
                      No hay mesas configuradas. Definí la cantidad en{" "}
                      <Link
                        href="/panel/config"
                        className="underline underline-offset-2"
                      >
                        Configuración
                      </Link>{" "}
                      y guardá.
                    </>
                  )}
                </p>
              ) : !mesasParaReserva.length ? (
                <p className="mb-3 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 dark:bg-amber-400/15 dark:text-amber-100">
                  {locale === "en"
                    ? reservaOcupadaPronto.size && !reservaChoquePorMesa.size
                      ? `Busy tables can’t take a booking before ${reservaDesdeOcupada}. Pick a later time.`
                      : "Every table is already booked around that time."
                    : reservaOcupadaPronto.size && !reservaChoquePorMesa.size
                      ? `Mesas ocupadas: no se puede reservar antes de las ${reservaDesdeOcupada}. Probá más tarde.`
                      : "Todas las mesas ya tienen reserva a esa hora."}
                </p>
              ) : !reservaPuedeCubrir ? (
                <p className="mb-3 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 dark:bg-amber-400/15 dark:text-amber-100">
                  {locale === "en"
                    ? `Not enough seats for ${reservaPersonas} people at that time (only ${reservaCapLibre} available). Try another time or lower the party size.`
                    : `No alcanzan las plazas para ${reservaPersonas} personas a esa hora (hay ${reservaCapLibre}). Probá otro horario o bajá el grupo.`}
                </p>
              ) : reservaMesasOk ? (
                <p className="mb-3 text-sm font-semibold text-espera">
                  {locale === "en"
                    ? `${reservaCapSeleccionada} / ${reservaPersonas} seats · ${tablesTitle(reservaMesas, "en")}`
                    : `${reservaCapSeleccionada} / ${reservaPersonas} plazas · ${tablesTitle(reservaMesas, "es")}`}
                </p>
              ) : (
                <p className="mb-3 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 dark:bg-amber-400/15 dark:text-amber-100">
                  {reservaMesas.length === 0
                    ? reservaCabeEnUna
                      ? locale === "en"
                        ? `Pick a table for ${reservaPersonas} people.`
                        : `Elegí una mesa para ${reservaPersonas} personas.`
                      : locale === "en"
                        ? `Party of ${reservaPersonas} needs 2+ tables — pick some to join.`
                        : `Grupo de ${reservaPersonas}: elegí 2 o más mesas.`
                    : locale === "en"
                      ? `${reservaCapSeleccionada} / ${reservaPersonas} seats — still short ${reservaFaltan}. Join another table.`
                      : `${reservaCapSeleccionada} / ${reservaPersonas} plazas, faltan ${reservaFaltan}. Juntá otra mesa.`}
                </p>
              )}
              {mesas.length ? (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {mesas.map((m) => {
                    const choque = reservaChoquePorMesa.get(m.number);
                    const ocupadaPronto = reservaOcupadaPronto.has(m.number);
                    const elegible = !choque && !ocupadaPronto;
                    const selected = reservaMesas.includes(m.number);
                    const cap = m.capacity ?? 4;
                    const oversized = elegible && cap > reservaPersonas;
                    const ocupadaOk =
                      m.status === "ocupada" && elegible;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={!elegible}
                        title={
                          choque
                            ? locale === "en"
                              ? `Booked ${reservationTime(choque.scheduledAt)} — ${choque.name}`
                              : `Reservada ${reservationTime(choque.scheduledAt)} — ${choque.name}`
                            : ocupadaPronto
                              ? locale === "en"
                                ? `Busy now — book from ${reservaDesdeOcupada}`
                                : `Ocupada ahora — reservá desde las ${reservaDesdeOcupada}`
                              : ocupadaOk
                                ? locale === "en"
                                  ? "Busy now · ok for this later time"
                                  : "Ocupada ahora · ok para este horario"
                                : undefined
                        }
                        onClick={() => {
                          if (!elegible) return;
                          setReservaMesas((prev) =>
                            prev.includes(m.number)
                              ? prev.filter((n) => n !== m.number)
                              : [...prev, m.number].sort((a, b) => a - b),
                          );
                        }}
                        className={
                          choque
                            ? "relative flex aspect-square cursor-not-allowed flex-col items-center justify-center rounded-2xl border-2 border-amber-600 bg-amber-400 text-center text-amber-950 opacity-70"
                            : ocupadaPronto
                              ? "relative flex aspect-square cursor-not-allowed flex-col items-center justify-center rounded-2xl border-2 border-rose-500 bg-rose-500/90 text-center text-white opacity-80"
                              : mesaTileClass(
                                  ocupadaOk ? "ocupada" : "libre",
                                  {
                                    pickable: true,
                                    selected,
                                    selectedAmber: true,
                                    oversized,
                                  },
                                )
                        }
                      >
                        <span className="font-display text-xl leading-none">
                          {m.number}
                        </span>
                        <span className="mt-1 text-[9px] font-bold uppercase tracking-wide opacity-90">
                          {choque
                            ? reservationTime(choque.scheduledAt)
                            : ocupadaPronto
                              ? locale === "en"
                                ? "Busy"
                                : "Ocup."
                              : ocupadaOk
                                ? locale === "en"
                                  ? "Busy · later ok"
                                  : "Ocup. · ok"
                                : locale === "en"
                                  ? "Free"
                                  : "Libre"}
                        </span>
                        <span className="mt-0.5 text-[9px] font-semibold opacity-80">
                          {cap}p
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
              ? `${confirmCancelEspera.name} will leave the waitlist.`
              : `${confirmCancelEspera.name} sale de la lista.`}
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
              {locale === "en" ? "Keep waiting" : "Seguir esperando"}
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
              ? `${tablesTitle(confirmCancelReserva.tableNumbers ?? [confirmCancelReserva.tableNumber], "en")} · ${confirmCancelReserva.name} will be freed.`
              : `${tablesTitle(confirmCancelReserva.tableNumbers ?? [confirmCancelReserva.tableNumber], "es")} · ${confirmCancelReserva.name} se libera.`}
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                void cancelarReserva(confirmCancelReservaId);
                setConfirmCancelReservaId(null);
                setHoldReservaId(null);
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

      {holdReserva && (
        <ModalShell
          onClose={() => setHoldReservaId(null)}
          labelledBy="hold-reserva-title"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-800/70">
            {locale === "en" ? "Reserved now" : "Reservada ahora"}
          </p>
          <h2
            id="hold-reserva-title"
            className="mt-1 font-display text-2xl uppercase tracking-tight text-carbon"
          >
            {holdReserva.name}
          </h2>
          <p className="mt-2 text-sm text-carbon/60">
            {tablesTitle(
              holdReserva.tableNumbers ?? [holdReserva.tableNumber],
              locale === "en" ? "en" : "es",
            )}{" "}
            · {holdReserva.partySize}{" "}
            {locale === "en" ? "guests" : "personas"} ·{" "}
            {reservationTime(holdReserva.scheduledAt)} · +
            {holdReserva.graceMinutes} min ·{" "}
            {timeUntilLabel(
              holdReserva.scheduledAt,
              locale === "en" ? "en" : "es",
              ahora,
            )}
          </p>
          <p className="mt-3 rounded-2xl border border-amber-400/50 bg-amber-50/80 px-3.5 py-3 text-sm text-amber-950 dark:bg-amber-400/10 dark:text-amber-100">
            {locale === "en"
              ? "Walk-ins can’t take this table while the hold is on. Seat the booking, cancel it, or wait for grace to end."
              : "No se puede sentar walk-in mientras esté en hold. Sentá la reserva, cancelala, o esperá que venza la tolerancia."}
          </p>
          <p className="mt-2 text-xs text-carbon/45">
            {locale === "en"
              ? "To change time or table: cancel and create a new booking."
              : "Para cambiar horario o mesa: cancelá y creá otra reserva."}
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => {
                const id = holdReserva.id;
                void sentarReserva(id).then(() => {
                  setHoldReservaId(null);
                  toast(
                    locale === "en"
                      ? `Seated at ${tablesTitle(holdReserva.tableNumbers ?? [holdReserva.tableNumber], "en")}`
                      : `Sentados en ${tablesTitle(holdReserva.tableNumbers ?? [holdReserva.tableNumber], "es")}`,
                    "success",
                  );
                });
              }}
              className={`${BTN_MOBILE} bg-carbon text-crema hover:opacity-90 sm:flex-1`}
            >
              {locale === "en" ? "Seat booking" : "Sentar reserva"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancelReservaId(holdReserva.id)}
              className={`${BTN_MOBILE} text-red-600/80 hover:bg-red-50 sm:flex-1`}
            >
              {locale === "en" ? "Cancel booking" : "Cancelar reserva"}
            </button>
            <button
              type="button"
              onClick={() => setHoldReservaId(null)}
              className={`${BTN_MOBILE} border border-linea text-carbon/70 hover:bg-crema sm:w-full`}
            >
              {locale === "en" ? "Close" : "Cerrar"}
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
          footer={
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={
                  !sentarMesas.length ||
                  mesas
                    .filter((m) => sentarMesas.includes(m.number))
                    .reduce((s, m) => s + (m.capacity ?? 4), 0) <
                    (sentarEspera?.partySize ?? 1)
                }
                onClick={() => {
                  if (!sentarId || !sentarMesas.length) return;
                  void sentar(sentarId, sentarMesas).then(() => {
                    const titulo = tablesTitle(
                      sentarMesas,
                      locale === "en" ? "en" : "es",
                    );
                    setSentarId(null);
                    setSentarMesas([]);
                    toast(
                      locale === "en"
                        ? `Seated at ${titulo}`
                        : `Sentados en ${titulo}`,
                      "success",
                    );
                  });
                }}
                className={`w-full rounded-full px-5 py-3.5 text-sm font-semibold text-crema transition disabled:opacity-40 ${
                  sentarAvisos.length
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-espera hover:bg-espera-fuerte"
                }`}
              >
                {sentarAvisos.length
                  ? locale === "en"
                    ? "Seat anyway"
                    : "Sentar igual"
                  : locale === "en"
                    ? "Seat"
                    : "Sentar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSentarId(null);
                  setSentarMesas([]);
                }}
                className="w-full rounded-full border border-linea px-5 py-3.5 text-sm font-semibold text-carbon transition hover:bg-crema"
              >
                {locale === "en" ? "Cancel" : "Cancelar"}
              </button>
            </div>
          }
        >
          <div className="flex items-start justify-between gap-3">
            <h2
              id="sentar-title"
              className="font-display text-xl uppercase tracking-tight text-carbon"
            >
              {locale === "en"
                ? `Seat ${sentarEspera?.name ?? ""}`
                : `Sentar a ${sentarEspera?.name ?? ""}`}
            </h2>
            <ModalCloseBtn
              onClick={() => {
                setSentarId(null);
                setSentarMesas([]);
              }}
              label={locale === "en" ? "Close" : "Cerrar"}
            />
          </div>
          <p className="mt-2 mb-1 text-sm text-carbon/55">
            {locale === "en"
              ? `Party of ${sentarEspera?.partySize ?? "?"}. Best-fit tables first — larger ones stay available.`
              : `Grupo de ${sentarEspera?.partySize ?? "?"}. Primero las que mejor entran; las más grandes las decidís vos.`}
          </p>
          {(() => {
            const need = sentarEspera?.partySize ?? 1;
            const selectedCap = mesas
              .filter((m) => sentarMesas.includes(m.number))
              .reduce((s, m) => s + (m.capacity ?? 4), 0);
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
                    ? ` · ${tablesTitle(sentarMesas, "en")}`
                    : ` · ${tablesTitle(sentarMesas, "es")}`
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
              <span className="size-2.5 rounded-sm border-2 border-amber-500 bg-espera" />
              {locale === "en" ? "Free · has booking" : "Libre · con reserva"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-rose-600" />
              {locale === "en" ? "Busy" : "Ocupada"}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {(() => {
              const need = sentarEspera?.partySize ?? 1;
              const libres = mesas
                .filter((m) => m.status === "libre")
                .sort((a, b) => {
                  const ca = a.capacity ?? 4;
                  const cb = b.capacity ?? 4;
                  const wa = ca >= need ? ca - need : 1000 + (need - ca);
                  const wb = cb >= need ? cb - need : 1000 + (need - cb);
                  return wa - wb || a.number - b.number;
                });
              const resto = mesas
                .filter((m) => m.status !== "libre")
                .sort((a, b) => a.number - b.number);
              return [...libres, ...resto];
            })().map((m) => {
              const libre = m.status === "libre";
              const selected = sentarMesas.includes(m.number);
              const cap = m.capacity ?? 4;
              const need = sentarEspera?.partySize ?? 1;
              const oversized = libre && cap > need;
              const reservaProx = libre
                ? reservaPorMesa.get(m.number)
                : undefined;
              const holding = reservaProx
                ? isReservationHolding(reservaProx, ahora)
                : false;
              const bloqueada = !libre || holding;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={bloqueada}
                  onClick={() => {
                    if (bloqueada) return;
                    setSentarMesas((prev) =>
                      prev.includes(m.number)
                        ? prev.filter((n) => n !== m.number)
                        : [...prev, m.number].sort((a, b) => a - b),
                    );
                  }}
                  className={mesaTileClass(m.status, {
                    pickable: !bloqueada,
                    selected: libre && selected && !holding,
                    oversized,
                    conReserva: !!reservaProx && !holding,
                    reservaHold: holding,
                  })}
                >
                  {reservaProx && !selected && (
                    <span
                      className={`absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none shadow-sm ${
                        holding
                          ? "bg-amber-950 text-amber-100"
                          : "bg-amber-400 text-amber-950"
                      }`}
                    >
                      {reservationTime(reservaProx.scheduledAt)}
                    </span>
                  )}
                  <span className="font-display text-xl leading-none">
                    {m.number}
                  </span>
                  <span className="mt-1 text-[9px] font-bold uppercase tracking-wide opacity-90">
                    {holding
                      ? locale === "en"
                        ? "Booked"
                        : "Reserva"
                      : libre
                        ? locale === "en"
                          ? "Free"
                          : "Libre"
                        : locale === "en"
                          ? "Busy"
                          : "Ocup."}
                  </span>
                  <span className="mt-0.5 text-[9px] font-semibold opacity-80">
                    {cap}p
                  </span>
                </button>
              );
            })}
          </div>
          <AvisoReserva avisos={sentarAvisos} locale={locale} ahora={ahora} />
        </ModalShell>
      )}

      {ocuparOpen && (
        <ModalShell
          onClose={() => {
            if (!ocupando) setOcuparOpen(false);
          }}
          labelledBy="ocupar-title"
          busy={ocupando}
          busyLabel={locale === "en" ? "Seating…" : "Ocupando…"}
          footer={
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={ocupando || !ocuparOk}
                onClick={() => {
                  if (!ocuparOk || ocupando) return;
                  setOcupando(true);
                  void ocuparMesas({
                    tableNumbers: ocuparMesasSel,
                    name: ocuparNombre,
                    partySize: ocuparPersonas,
                    employee: employeeRef,
                  })
                    .then((res) => {
                      if (!res.ok) {
                        toast(motivoOcupar(res.reason, locale), "error");
                        return;
                      }
                      const titulo = tablesTitle(
                        ocuparMesasSel,
                        locale === "en" ? "en" : "es",
                      );
                      setOcuparOpen(false);
                      setOcuparNombre("");
                      setOcuparMesasSel([]);
                      setOcuparPrimaria(null);
                      setOcuparPersonas(2);
                      toast(
                        locale === "en"
                          ? `Seated at ${titulo}`
                          : `Ocupada ${titulo}`,
                        "success",
                      );
                    })
                    .finally(() => setOcupando(false));
                }}
                className={`w-full rounded-full px-5 py-3.5 text-sm font-semibold text-crema transition disabled:opacity-40 ${
                  ocuparAvisos.length
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-espera hover:bg-espera-fuerte"
                }`}
              >
                {ocupando
                  ? "…"
                  : !ocuparOk && ocuparFaltan > 0
                    ? locale === "en"
                      ? `Need ${ocuparFaltan} more seats`
                      : `Faltan ${ocuparFaltan} plazas`
                    : ocuparAvisos.length
                      ? locale === "en"
                        ? "Seat anyway"
                        : "Sentar igual"
                      : locale === "en"
                        ? "Seat"
                        : "Sentar"}
              </button>
              {ocuparPrimaria != null && (
                <button
                  type="button"
                  disabled={ocupando}
                  onClick={() => {
                    setEditCapacidadNumero(ocuparPrimaria);
                    setEditCapacidadValue(
                      ocuparPrimariaMesa?.capacity ?? 4,
                    );
                  }}
                  className="w-full rounded-full border border-linea px-5 py-3 text-sm font-semibold text-carbon transition hover:bg-crema disabled:opacity-50"
                >
                  {locale === "en"
                    ? `Edit seats (table ${ocuparPrimaria})`
                    : `Editar plazas (mesa ${ocuparPrimaria})`}
                </button>
              )}
              <button
                type="button"
                disabled={ocupando}
                onClick={() => setOcuparOpen(false)}
                className="w-full rounded-full border border-linea px-5 py-3.5 text-sm font-semibold text-carbon transition hover:bg-crema disabled:opacity-50"
              >
                {locale === "en" ? "Cancel" : "Cancelar"}
              </button>
            </div>
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="ocupar-title"
                className="font-display text-xl uppercase tracking-tight text-carbon"
              >
                {ocuparPrimaria != null
                  ? locale === "en"
                    ? `Seat at table ${ocuparPrimaria}`
                    : `Sentar en mesa ${ocuparPrimaria}`
                  : locale === "en"
                    ? "Seat now"
                    : "Sentar en una mesa"}
              </h2>
              <p className="mt-1 text-sm text-carbon/55">
                {locale === "en"
                  ? "Walk-in: no QR, no waitlist."
                  : "Walk-in: sin QR ni lista de espera."}
              </p>
            </div>
            <ModalCloseBtn
              disabled={ocupando}
              onClick={() => setOcuparOpen(false)}
              label={locale === "en" ? "Close" : "Cerrar"}
            />
          </div>

          <AvisoBloqueoReserva
            mesas={ocuparBloqueadas}
            porMesa={mesaTomadaPorReserva}
            locale={locale}
          />
          <AvisoReserva avisos={ocuparAvisos} locale={locale} ahora={ahora} />

          <label className="mt-4 flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-carbon/70">
              {locale === "en" ? "Name (optional)" : "Nombre (opcional)"}
            </span>
            <input
              className={INPUT}
              value={ocuparNombre}
              disabled={ocupando}
              onChange={(e) => setOcuparNombre(e.target.value)}
              placeholder="Pérez"
              autoFocus
            />
          </label>

          <div className="mt-4 flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-carbon/70">
              {locale === "en" ? "Party size" : "Personas"}
            </span>
            <PersonasChips
              value={ocuparPersonas}
              onChange={setOcuparPersonas}
            />
          </div>

          <div
            className={`mt-4 rounded-2xl border px-3 py-3 ${
              ocuparOk
                ? "border-espera/40 bg-espera/10"
                : "border-amber-300/60 bg-amber-50 dark:bg-amber-400/10"
            }`}
          >
            <p className="text-sm font-semibold text-carbon">
              {tablesTitle(
                ocuparMesasSel,
                locale === "en" ? "en" : "es",
              )}
              <span className="font-normal text-carbon/55">
                {" "}
                · {ocuparCap}/{ocuparPersonas}{" "}
                {locale === "en" ? "seats" : "plazas"}
              </span>
            </p>
            <p
              className={`mt-1 text-sm font-semibold ${
                ocuparOk ? "text-espera" : "text-amber-800 dark:text-amber-200"
              }`}
            >
              {ocuparOk
                ? locale === "en"
                  ? "Fits the party."
                  : "Entran todas."
                : locale === "en"
                  ? `Short ${ocuparFaltan} — pick another free table below.`
                  : `Faltan ${ocuparFaltan}, elegí otra mesa libre abajo.`}
            </p>
          </div>

          {ocuparNecesitaMapa && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/50">
                {locale === "en" ? "Free tables to join" : "Mesas libres para juntar"}
              </p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {mesasLibres.map((m) => {
                  const selected = ocuparMesasSel.includes(m.number);
                  const cap = m.capacity ?? 4;
                  const esPrimaria = m.number === ocuparPrimaria;
                  const reservaProx = reservaPorMesa.get(m.number);
                  const holding = reservaProx
                    ? isReservationHolding(reservaProx, ahora)
                    : false;
                  const bloqueada = ocupando || esPrimaria || holding;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={bloqueada}
                      onClick={() => {
                        if (esPrimaria || holding) return;
                        setOcuparMesasSel((prev) =>
                          prev.includes(m.number)
                            ? prev.filter((n) => n !== m.number)
                            : [...prev, m.number].sort((a, b) => a - b),
                        );
                      }}
                      className={mesaTileClass("libre", {
                        pickable: !bloqueada,
                        selected: selected && !holding,
                        conReserva: !!reservaProx && !holding,
                        reservaHold: holding,
                      })}
                    >
                      {reservaProx && !selected && (
                        <span
                          className={`absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none shadow-sm ${
                            holding
                              ? "bg-amber-950 text-amber-100"
                              : "bg-amber-400 text-amber-950"
                          }`}
                        >
                          {reservationTime(reservaProx.scheduledAt)}
                        </span>
                      )}
                      <span className="font-display text-xl leading-none">
                        {m.number}
                      </span>
                      <span className="mt-1 text-[9px] font-bold uppercase tracking-wide opacity-90">
                        {holding
                          ? locale === "en"
                            ? "Booked"
                            : "Reserva"
                          : selected
                            ? locale === "en"
                              ? "On"
                              : "Sí"
                            : locale === "en"
                              ? "Free"
                              : "Libre"}
                      </span>
                      <span className="mt-0.5 text-[9px] font-semibold opacity-80">
                        {cap}p
                      </span>
                    </button>
                  );
                })}
              </div>
              {!mesasLibres.filter((m) => m.number !== ocuparPrimaria)
                .length && (
                <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
                  {locale === "en"
                    ? "No other free tables. Free one or lower the party size."
                    : "No hay más mesas libres. Liberá una o bajá las personas."}
                </p>
              )}
            </div>
          )}
        </ModalShell>
      )}

      {liberarNumero != null && liberarMesaView && (
        <ModalShell
          onClose={() => setLiberarNumero(null)}
          labelledBy="liberar-title"
          footer={
            <div className="flex flex-col gap-2">
              {liberarTieneGrupo && liberarMesaView.status === "ocupada" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      void liberarMesa(liberarNumero).then(() => {
                        setLiberarNumero(null);
                        toast(
                          locale === "en"
                            ? `${liberarGrupoTitulo} free`
                            : `${liberarGrupoTitulo} libres`,
                          "success",
                        );
                      });
                    }}
                    className="w-full rounded-full bg-espera px-5 py-3.5 text-sm font-semibold text-crema transition hover:bg-espera-fuerte"
                  >
                    {locale === "en"
                      ? `Free all (${liberarGrupoLabel})`
                      : `Liberar todas (${liberarGrupoLabel})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void liberarMesa(liberarNumero, { soloEsta: true }).then(
                        () => {
                          setLiberarNumero(null);
                          toast(
                            locale === "en"
                              ? `Table ${liberarNumero} free`
                              : `Mesa ${liberarNumero} libre`,
                            "success",
                          );
                        },
                      );
                    }}
                    className="w-full rounded-full border border-espera/40 bg-espera/10 px-5 py-3.5 text-sm font-semibold text-espera transition hover:bg-espera hover:text-crema"
                  >
                    {locale === "en"
                      ? `Only table ${liberarNumero}`
                      : `Solo mesa ${liberarNumero}`}
                  </button>
                </>
              ) : (
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
              )}
              <button
                type="button"
                onClick={() => setLiberarNumero(null)}
                className="w-full rounded-full border border-linea px-5 py-3.5 text-sm font-semibold text-carbon transition hover:bg-crema"
              >
                {locale === "en" ? "Cancel" : "Cancelar"}
              </button>
            </div>
          }
        >
          <div className="flex items-start justify-between gap-3">
            <h2
              id="liberar-title"
              className="font-display text-xl uppercase tracking-tight text-carbon"
            >
              {locale === "en"
                ? `Free table ${liberarNumero}?`
                : `¿Liberar mesa ${liberarNumero}?`}
            </h2>
            <ModalCloseBtn
              onClick={() => setLiberarNumero(null)}
              label={locale === "en" ? "Close" : "Cerrar"}
            />
          </div>
          {liberarMesaView.status === "ocupada" ? (
            <div className="mt-3 rounded-2xl border border-rose-300/40 bg-rose-50/70 px-3.5 py-3 dark:bg-rose-400/10">
              {(liberarEspera || liberarReserva) && (
                <>
                  <p className="font-display text-lg uppercase tracking-tight text-carbon">
                    {liberarEspera?.name ?? liberarReserva?.name}
                  </p>
                  <p className="mt-1 text-sm text-carbon/60">
                    {liberarEspera
                      ? `${liberarEspera.partySize} ${locale === "en" ? "guests" : "personas"}`
                      : liberarReserva
                        ? `${formatHora(liberarReserva.scheduledAt, locale)} · ${liberarReserva.partySize} ${locale === "en" ? "guests" : "personas"}`
                        : null}
                  </p>
                </>
              )}
              <p className="mt-2 text-sm text-carbon/55">
                {liberarTieneGrupo
                  ? locale === "en"
                    ? `${liberarGrupoTitulo} joined. Free all, or only this one if the party got smaller.`
                    : `${liberarGrupoTitulo} juntas. Liberá todas, o solo esta si el grupo se achicó.`
                  : locale === "en"
                    ? "Marks the table as free again."
                    : "La mesa vuelve a quedar libre."}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-carbon/60">
              {locale === "en"
                ? "Marks the table as free again."
                : "La mesa vuelve a quedar libre."}
            </p>
          )}
        </ModalShell>
      )}

      {editCapacidadNumero != null && editCapacidadMesa && (
        <ModalShell
          onClose={() => setEditCapacidadNumero(null)}
          labelledBy="capacidad-title"
          footer={
            <div className="flex flex-col gap-2">
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
                className="w-full rounded-full bg-espera px-5 py-3.5 text-sm font-semibold text-crema transition hover:bg-espera-fuerte"
              >
                {locale === "en" ? "Save" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setEditCapacidadNumero(null)}
                className="w-full rounded-full border border-linea px-5 py-3.5 text-sm font-semibold text-carbon transition hover:bg-crema"
              >
                {locale === "en" ? "Cancel" : "Cancelar"}
              </button>
            </div>
          }
        >
          <div className="flex items-start justify-between gap-3">
            <h2
              id="capacidad-title"
              className="font-display text-xl uppercase tracking-tight text-carbon"
            >
              {locale === "en"
                ? `Table ${editCapacidadNumero} seats`
                : `Plazas mesa ${editCapacidadNumero}`}
            </h2>
            <ModalCloseBtn
              onClick={() => setEditCapacidadNumero(null)}
              label={locale === "en" ? "Close" : "Cerrar"}
            />
          </div>
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
                className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  editCapacidadValue === n
                    ? "bg-espera text-crema"
                    : "border border-linea text-carbon/70 hover:bg-crema"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <NumberStepper
              value={editCapacidadValue}
              onChange={setEditCapacidadValue}
              min={1}
              max={50}
            />
          </div>
        </ModalShell>
      )}
    </div>
  );
};

export default EsperaPanelPage;

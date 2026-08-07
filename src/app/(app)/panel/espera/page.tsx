"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { NotifyResult } from "@/lib/notify";
import Link from "next/link";
import { ModuleSwitcher } from "@/components/panel/ModuleSwitcher";
import { QrModal } from "@/components/panel/QrModal";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { Pagination, slicePage } from "@/components/ui/Pagination";
import { HelpLink } from "@/components/panel/HelpLink";
import { useApp } from "@/components/providers/Providers";
import { useWaitlist } from "@/lib/hooks/useWaitlist";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useToast } from "@/components/ui/Toast";
import { businessDayStart } from "@/lib/businessDay";
import {
  WAITLIST_STATUS_LABEL,
  RESERVATION_STATUS_LABEL,
  waitlistClosed,
  tableNumbersLabel,
  tablesTitle,
  type WaitlistView,
  type TableState,
  type ReservationView,
} from "@/lib/types";
import {
  isReservationSoon,
  timeUntilLabel,
  reservationTime,
  reservationTables,
  conflictingReservation,
  nextReservationByTable,
  tablesHeldByReservation,
} from "@/lib/reservations";
import {
  readDeviceMode,
  visibleModules,
} from "@/lib/modules";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import type {
  SeatWalkInReason,
  NewReservationReason,
} from "@/lib/data/waitlist";

const PAGE_SIZE = 20;
const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none transition focus:border-espera focus:ring-2 focus:ring-espera/20 placeholder:text-carbon/40";

const BTN_MOBILE =
  "w-full rounded-full px-4 py-3.5 text-sm font-semibold transition active:scale-[0.98] sm:w-auto sm:px-4 sm:py-2.5";

const NumberStepper = ({
  value,
  onChange,
  min = 1,
  max = 50,
  accent = "espera",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  accent?: "espera" | "marca";
}) => {
  const btn =
    accent === "espera"
      ? "border-espera/40 text-espera active:bg-espera active:text-crema"
      : "border-marca/40 text-marca active:bg-marca active:text-crema";
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="flex w-full items-center gap-3">
      <button
        type="button"
        aria-label="−"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className={`flex size-12 shrink-0 items-center justify-center rounded-2xl border-2 text-2xl font-bold transition disabled:opacity-30 ${btn}`}
      >
        −
      </button>
      <div className="flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-linea bg-crema/50 font-display text-3xl text-carbon">
        {value}
      </div>
      <button
        type="button"
        aria-label="+"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className={`flex size-12 shrink-0 items-center justify-center rounded-2xl border-2 text-2xl font-bold transition disabled:opacity-30 ${btn}`}
      >
        +
      </button>
    </div>
  );
};

const PERSONAS_CHIPS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const PersonasChips = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) => {
  const otro = value > 8;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {PERSONAS_CHIPS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
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
          onClick={() => onChange(Math.max(9, value > 8 ? value : 9))}
          className={`flex h-11 min-w-11 items-center justify-center rounded-xl px-3 text-sm font-bold transition active:scale-95 ${
            otro
              ? "bg-espera text-crema"
              : "border border-linea bg-crema/40 text-carbon hover:border-espera/40"
          }`}
        >
          9+
        </button>
      </div>
      {otro && (
        <NumberStepper value={value} onChange={onChange} min={9} max={50} />
      )}
    </div>
  );
};

const mesaTileClass = (
  status: TableState,
  opts?: {
    pickable?: boolean;
    selected?: boolean;
    tooSmall?: boolean;
    oversized?: boolean;
    reservaPronto?: boolean;
  },
) => {
  const base =
    "relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 text-center transition";
  if (opts?.selected) {
    return `${base} border-espera bg-espera text-crema ring-2 ring-espera/40`;
  }
  if (opts?.tooSmall && status === "libre") {
    return `${base} border-espera/30 bg-espera/15 text-espera/50 cursor-not-allowed`;
  }
  if (status === "libre") {
    return `${base} ${
      opts?.reservaPronto
        ? "border-amber-500 ring-2 ring-amber-400/50"
        : "border-espera"
    } bg-espera text-crema ${opts?.oversized ? "opacity-80" : ""} ${
      opts?.pickable ? "hover:bg-espera-fuerte active:scale-95" : ""
    }`;
  }
  return `${base} border-rose-700 bg-rose-600 text-white ${
    opts?.pickable === false ? "cursor-not-allowed opacity-70" : ""
  }`;
};

const AvisoReserva = ({
  avisos,
  locale,
  ahora,
}: {
  avisos: { number: number; reserva: ReservationView }[];
  locale: string;
  ahora: number;
}) => {
  if (!avisos.length) return null;
  return (
    <div className="mt-4 rounded-2xl border border-amber-400/60 bg-amber-50/80 px-3.5 py-3 dark:bg-amber-400/10">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        {locale === "en"
          ? avisos.length === 1
            ? "This table has a booking"
            : "These tables have bookings"
          : avisos.length === 1
            ? "Esta mesa tiene reserva"
            : "Estas mesas tienen reserva"}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {avisos.map(({ number, reserva }) => (
          <li key={`${number}-${reserva.id}`} className="text-sm text-carbon/75">
            <span className="font-semibold text-carbon">
              {locale === "en" ? `Table ${number}` : `Mesa ${number}`} ·{" "}
              {reservationTime(reserva.scheduledAt)}
            </span>{" "}
            — {reserva.name}, {reserva.partySize}{" "}
            {locale === "en" ? "guests" : "personas"} (
            {timeUntilLabel(reserva.scheduledAt, locale === "en" ? "en" : "es", ahora)})
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-carbon/60">
        {locale === "en"
          ? "Seat them anyway if there's enough time, or cancel and pick another table."
          : "Sentalos igual si les da el tiempo, o cancelá y elegí otra mesa."}
      </p>
    </div>
  );
};

const minsAgo = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));

const pad2 = (n: number) => String(n).padStart(2, "0");

const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const SLOT_STEP_MIN = 15;
const SLOT_START_MIN = 11 * 60;
const SLOT_END_MIN = 23 * 60 + 45;

const snapToSlot = (d: Date) => {
  const out = new Date(d);
  out.setSeconds(0, 0);
  const total = out.getHours() * 60 + out.getMinutes();
  const snapped = Math.ceil(total / SLOT_STEP_MIN) * SLOT_STEP_MIN;
  out.setHours(Math.floor(snapped / 60), snapped % 60, 0, 0);
  return out;
};

const defaultHorarioInput = () => {
  const d = snapToSlot(new Date(Date.now() + 60 * 60_000));
  return toLocalInput(d);
};

const dateKeyFromLocal = (local: string) => local.slice(0, 10);
const timeKeyFromLocal = (local: string) => local.slice(11, 16);

const combineLocalHorario = (dateKey: string, timeKey: string) =>
  `${dateKey}T${timeKey}`;

const todayDateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const addDaysKey = (dateKey: string, days: number) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
};

const buildDayOptions = (locale: string) => {
  const today = todayDateKey();
  const loc = locale === "en" ? "en-US" : "es-AR";
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDaysKey(today, i);
    const [y, m, d] = key.split("-").map(Number);
    const label =
      i === 0
        ? locale === "en"
          ? "Today"
          : "Hoy"
        : i === 1
          ? locale === "en"
            ? "Tomorrow"
            : "Mañana"
          : new Date(y, m - 1, d).toLocaleDateString(loc, {
              weekday: "short",
              day: "numeric",
            });
    return { key, label };
  });
};

const allTimeSlots = (() => {
  const slots: string[] = [];
  for (let m = SLOT_START_MIN; m <= SLOT_END_MIN; m += SLOT_STEP_MIN) {
    slots.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
  }
  return slots;
})();

const availableTimeSlots = (dateKey: string) => {
  if (dateKey !== todayDateKey()) return allTimeSlots;
  const now = snapToSlot(new Date());
  const minKey = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  return allTimeSlots.filter((t) => t >= minKey);
};

const ReservaHorarioPicker = ({
  value,
  onChange,
  locale,
}: {
  value: string;
  onChange: (v: string) => void;
  locale: string;
}) => {
  const days = useMemo(() => buildDayOptions(locale), [locale]);
  const dateKey = dateKeyFromLocal(value) || todayDateKey();
  const timeKey = timeKeyFromLocal(value) || "20:00";
  const slots = useMemo(() => availableTimeSlots(dateKey), [dateKey]);

  useEffect(() => {
    if (!slots.length) return;
    if (!slots.includes(timeKey)) {
      onChange(combineLocalHorario(dateKey, slots[0]));
    }
  }, [dateKey, timeKey, slots, onChange]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-linea bg-crema/30 p-3">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-carbon/45">
          {locale === "en" ? "Day" : "Día"}
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {days.map((d) => {
            const active = d.key === dateKey;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => {
                  const nextSlots = availableTimeSlots(d.key);
                  const t = nextSlots.includes(timeKey)
                    ? timeKey
                    : (nextSlots[0] ?? timeKey);
                  onChange(combineLocalHorario(d.key, t));
                }}
                className={`flex min-h-11 shrink-0 items-center justify-center rounded-full px-4 text-sm font-semibold capitalize transition sm:min-h-0 sm:px-3.5 sm:py-2 ${
                  active
                    ? "bg-espera text-crema"
                    : "border border-linea bg-surface text-carbon/70 hover:bg-carbon/5"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-carbon/45">
          {locale === "en" ? "Time · every 15 min" : "Hora · cada 15 min"}
        </p>
        {slots.length ? (
          <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto rounded-xl sm:grid-cols-5">
            {slots.map((t) => {
              const active = t === timeKey;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange(combineLocalHorario(dateKey, t))}
                  className={`rounded-xl px-2 py-2.5 text-sm font-semibold tabular-nums transition active:scale-95 ${
                    active
                      ? "bg-espera text-crema shadow-sm"
                      : "border border-linea bg-surface text-carbon hover:border-espera/40"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-linea bg-surface px-3 py-3 text-sm text-carbon/55">
            {locale === "en"
              ? "No more slots today — pick another day."
              : "No quedan horarios hoy, elegí otro día."}
          </p>
        )}
      </div>
    </div>
  );
};

/* Hard block, unlike AvisoReserva which is only a heads-up. These tables have
 * a booking inside its grace period, so the database is going to refuse them
 * and the button stays disabled. Says who is coming and until when, otherwise
 * it just looks like the button broke. */
const AvisoBloqueoReserva = ({
  mesas,
  porMesa,
  locale,
}: {
  mesas: number[];
  porMesa: Map<number, ReservationView>;
  locale: string;
}) => {
  if (!mesas.length) return null;
  const es = locale !== "en";
  return (
    <div className="mt-4 rounded-2xl border border-red-400/60 bg-red-50/80 px-3.5 py-3 dark:bg-red-500/10">
      <p className="text-sm font-semibold text-red-900 dark:text-red-200">
        {mesas.length === 1
          ? es
            ? "Esta mesa está reservada ahora"
            : "This table is booked right now"
          : es
            ? "Estas mesas están reservadas ahora"
            : "These tables are booked right now"}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {mesas.map((n) => {
          const r = porMesa.get(n);
          if (!r) return null;
          const hasta = new Date(
            new Date(r.scheduledAt).getTime() + r.graceMinutes * 60_000,
          );
          return (
            <li key={n} className="text-sm text-carbon/75">
              <span className="font-semibold text-carbon">
                {es ? `Mesa ${n}` : `Table ${n}`} ·{" "}
                {reservationTime(r.scheduledAt)}
              </span>{" "}
              — {r.name}
              {es
                ? `, tolerancia hasta las ${reservationTime(hasta.toISOString())}`
                : `, held until ${reservationTime(hasta.toISOString())}`}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm text-carbon/60">
        {es
          ? "Elegí otra mesa. Cuando venza la tolerancia esta se libera sola."
          : "Pick another table. This one frees up on its own once the grace period ends."}
      </p>
    </div>
  );
};

/* Why the seat attempt was rejected. It used to be one generic "table taken?"
 * for every failure, which was wrong half the time: the usual case now is a
 * table held by a booking that is still inside its grace period. */
const motivoOcupar = (reason: SeatWalkInReason, locale: string): string => {
  const es = locale !== "en";
  if (reason === "suscripcion-vencida") {
    return es
      ? "La cuenta está dada de baja. Escribinos para reactivarla."
      : "The account is suspended. Get in touch to reactivate it.";
  }
  if (reason === "mesa-reservada") {
    return es
      ? "Esa mesa tiene una reserva en curso. Esperá a que venza la tolerancia o elegí otra."
      : "That table has a booking in progress. Wait for the grace period to end or pick another.";
  }
  if (reason === "mesa-no-disponible") {
    return es
      ? "Alguien ocupó esa mesa recién. Recargá y elegí otra."
      : "Someone just took that table. Reload and pick another.";
  }
  if (reason === "sin-mesas") {
    return es ? "Elegí al menos una mesa." : "Pick at least one table.";
  }
  return es
    ? "No se pudo ocupar. Revisá la conexión y probá de nuevo."
    : "Couldn’t seat. Check the connection and try again.";
};

/* Why the booking was rejected. It used to be one generic "table not
 * available" for all five failure modes, including the one that matters most:
 * another booking already sitting too close in time on the same table. */
const motivoReserva = (
  reason: NewReservationReason,
  locale: string,
): string => {
  const es = locale !== "en";
  if (reason === "suscripcion-vencida") {
    return es
      ? "La cuenta está dada de baja. Escribinos para reactivarla."
      : "The account is suspended. Get in touch to reactivate it.";
  }
  if (reason === "choque") {
    return es
      ? "Esa mesa ya tiene una reserva muy cerca de ese horario. Elegí otra mesa u otro horario."
      : "That table already has a booking too close to that time. Pick another table or time.";
  }
  if (reason === "capacidad-insuficiente") {
    return es
      ? "Las mesas elegidas no alcanzan para esa cantidad de personas."
      : "The selected tables don't fit that party size.";
  }
  if (reason === "mesa-inexistente") {
    return es
      ? "Alguna de esas mesas ya no existe. Recargá y probá de nuevo."
      : "One of those tables no longer exists. Reload and try again.";
  }
  if (reason === "sin-mesas") {
    return es ? "Elegí al menos una mesa." : "Pick at least one table.";
  }
  if (reason === "sin-horario") {
    return es ? "Elegí un horario válido." : "Pick a valid time.";
  }
  return es
    ? "No se pudo reservar. Revisá la conexión y probá de nuevo."
    : "Couldn't book. Check the connection and try again.";
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
  const tableCount = useConfigStore((s) => s.tableCount);
  const cutoffHour = useConfigStore((s) => s.cutoffHour);
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
  } = useWaitlist(branchId);

  const [qr, setQr] = useState<WaitlistView | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reservaOpen, setReservaOpen] = useState(false);
  const [name, setNombre] = useState("");
  const [partySize, setPersonas] = useState(2);
  const [creating, setCreating] = useState(false);
  const [reservaNombre, setReservaNombre] = useState("");
  const [reservaPersonas, setReservaPersonas] = useState(2);
  const [reservaMesas, setReservaMesas] = useState<number[]>([]);
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
  const [ocuparOpen, setOcuparOpen] = useState(false);
  const [ocuparMesasSel, setOcuparMesasSel] = useState<number[]>([]);
  const [ocuparPrimaria, setOcuparPrimaria] = useState<number | null>(null);
  const [ocuparNombre, setOcuparNombre] = useState("");
  const [ocuparPersonas, setOcuparPersonas] = useState(2);
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
  }, [branchConfigReady, visibles, router]);

  /* Cerrar el QR cuando el cliente lo abre. `visto_en` llega por realtime
   * dentro de la propia espera, así que alcanza con mirar la lista. */
  useEffect(() => {
    if (!qr) return;
    const fresh = esperas.find((e) => e.id === qr.id);
    if (fresh?.seenAt) setQr(null);
  }, [esperas, qr]);

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

  /* Tables the database will refuse for a walk-in right now: a booking is
   * inside its grace period. Kept separate from reservaPorMesa, which is the
   * soft "this table has a booking later" warning. */
  const mesaTomadaPorReserva = useMemo(
    () => tablesHeldByReservation(reservas, ahora),
    [reservas, ahora],
  );

  const reservaPorMesa = useMemo(
    () => nextReservationByTable(reservas, ahora),
    [reservas, ahora],
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
  const mesasParaReserva = mesas.filter(
    (m) => !reservaChoquePorMesa.has(m.number),
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
        setQr(created);
        setCreateOpen(false);
        setNombre("");
        setPersonas(2);
        toast(
          locale === "en" ? "Added to waitlist" : "Agregado a la lista",
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
    if (!reservaMesasOk) {
      const msg = !mesasParaReserva.length
        ? locale === "en"
          ? "Every table is already booked around that time"
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
    const scheduledAt = new Date(reservaHorario);
    if (Number.isNaN(scheduledAt.getTime())) {
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
        setReservaHorario(defaultHorarioInput());
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
            ? "Tap free → seat now · tap busy → free. A booking only warns, it never blocks the table."
            : "Libre → sentar · ocupada → liberar. La reserva solo avisa, nunca bloquea la mesa."}
        </p>
      </div>

      <section className="rounded-[24px] border border-espera/20 bg-surface p-4 shadow-sm sm:p-5">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
          {mesasFiltradas.map((m) => {
            const espera =
              m.waitlistId != null ? esperaById.get(m.waitlistId) : undefined;
            const reservaSentada =
              m.reservationId != null ? reservaById.get(m.reservationId) : undefined;
            const libre = m.status === "libre";
            const reservaProx = reservaPorMesa.get(m.number);
            const pronto = reservaProx
              ? isReservationSoon(reservaProx, ahora)
              : false;
            const etiquetaGrupo = libre
              ? reservaProx?.name
              : (espera?.name ?? reservaSentada?.name);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
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
                  libre
                    ? reservaProx
                      ? locale === "en"
                        ? `Free now · booking ${reservationTime(reservaProx.scheduledAt)} (${reservaProx.name})`
                        : `Libre ahora · reserva ${reservationTime(reservaProx.scheduledAt)} (${reservaProx.name})`
                      : locale === "en"
                        ? "Tap to seat now"
                        : "Tocar para sentar"
                    : locale === "en"
                      ? "Tap to free"
                      : "Tocar para liberar"
                }
                className={mesaTileClass(m.status, {
                  pickable: libre,
                  reservaPronto: pronto,
                })}
              >
                {reservaProx && (
                  <span
                    className={`absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none shadow-sm ${
                      pronto
                        ? "bg-amber-400 text-amber-950"
                        : "bg-carbon/70 text-crema"
                    }`}
                  >
                    {reservationTime(reservaProx.scheduledAt)}
                  </span>
                )}
                <span className="font-display text-lg leading-none">
                  {m.number}
                </span>
                <span className="mt-1 text-[10px] font-bold uppercase tracking-wide opacity-90">
                  {libre
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
                {etiquetaGrupo && (
                  <span className="mt-0.5 max-w-full truncate px-1 text-[9px] font-medium opacity-80">
                    {etiquetaGrupo}
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
                      {r.name}
                    </h3>
                    <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950 dark:bg-amber-400/30 dark:text-amber-100">
                      {RESERVATION_STATUS_LABEL[r.status]}
                    </span>
                    <span className="rounded-full bg-carbon/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-carbon/70">
                      {tablesTitle(
                        r.tableNumbers ?? [r.tableNumber],
                        locale === "en" ? "en" : "es",
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-carbon/55">
                    {formatHora(r.scheduledAt, locale)} · {r.partySize}{" "}
                    {locale === "en" ? "guests" : "personas"} · +
                    {r.graceMinutes} min
                    {r.employee ? ` · ${r.employee}` : ""}
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      void sentarReserva(r.id).then(() =>
                        toast(
                          locale === "en"
                            ? `Seated at ${tablesTitle(r.tableNumbers ?? [r.tableNumber], "en")}`
                            : `Sentados en ${tablesTitle(r.tableNumbers ?? [r.tableNumber], "es")}`,
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
              : "Ninguna hoy, usá + Reserva cuando haga falta."}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-carbon/70">
          {locale === "en" ? "Waiting list" : "Lista de espera"}
          {cola.length ? ` · ${cola.length}` : ""}
        </h2>
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
                      onClick={() => setQr(e)}
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

      {qr && (
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
                disabled={creating}
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
              />
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-carbon/70">
                {locale === "en" ? "Table" : "Mesa"}
              </legend>
              <p className="mb-2 text-xs text-carbon/45">
                {locale === "en"
                  ? reservaCabeEnUna
                    ? "Pick a table that fits. Busy now is fine — the booking is for later."
                    : "No single table fits — join 2 or more."
                  : reservaCabeEnUna
                    ? "Elegí una mesa que entre al grupo. Que esté ocupada ahora no importa: la reserva es para más tarde."
                    : "Ninguna mesa sola alcanza: juntá 2 o más."}
              </p>
              {!mesasParaReserva.length ? (
                <p className="mb-3 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 dark:bg-amber-400/15 dark:text-amber-100">
                  {locale === "en"
                    ? "Every table is already booked around that time."
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
                    const elegible = !choque;
                    const selected = reservaMesas.includes(m.number);
                    const cap = m.capacity ?? 4;
                    const oversized = elegible && cap > reservaPersonas;
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
                            : mesaTileClass("libre", {
                                pickable: true,
                                selected,
                                oversized,
                              })
                        }
                      >
                        <span className="font-display text-xl leading-none">
                          {m.number}
                        </span>
                        <span className="mt-1 text-[9px] font-bold uppercase tracking-wide opacity-90">
                          {choque
                            ? reservationTime(choque.scheduledAt)
                            : m.status === "ocupada"
                              ? locale === "en"
                                ? "Busy now"
                                : "Ocup. ahora"
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
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={!libre}
                  onClick={() => {
                    if (!libre) return;
                    setSentarMesas((prev) =>
                      prev.includes(m.number)
                        ? prev.filter((n) => n !== m.number)
                        : [...prev, m.number].sort((a, b) => a - b),
                    );
                  }}
                  className={mesaTileClass(m.status, {
                    pickable: libre,
                    selected: libre && selected,
                    oversized,
                    reservaPronto: !!reservaProx,
                  })}
                >
                  {reservaProx && !selected && (
                    <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold leading-none text-amber-950 shadow-sm">
                      {reservationTime(reservaProx.scheduledAt)}
                    </span>
                  )}
                  <span className="font-display text-xl leading-none">
                    {m.number}
                  </span>
                  <span className="mt-1 text-[9px] font-bold uppercase tracking-wide opacity-90">
                    {libre
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
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={ocupando || esPrimaria}
                      onClick={() => {
                        if (esPrimaria) return;
                        setOcuparMesasSel((prev) =>
                          prev.includes(m.number)
                            ? prev.filter((n) => n !== m.number)
                            : [...prev, m.number].sort((a, b) => a - b),
                        );
                      }}
                      className={mesaTileClass("libre", {
                        pickable: true,
                        selected,
                        reservaPronto: !!reservaProx,
                      })}
                    >
                      {reservaProx && !selected && (
                        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold leading-none text-amber-950 shadow-sm">
                          {reservationTime(reservaProx.scheduledAt)}
                        </span>
                      )}
                      <span className="font-display text-xl leading-none">
                        {m.number}
                      </span>
                      <span className="mt-1 text-[9px] font-bold uppercase tracking-wide opacity-90">
                        {selected
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

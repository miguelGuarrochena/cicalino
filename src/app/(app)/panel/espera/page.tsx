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

const PAGE_SIZE = 8;
const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none transition focus:border-espera focus:ring-2 focus:ring-espera/20 placeholder:text-carbon/40";

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
  const paginated = slicePage(cola, page, PAGE_SIZE);
  const sentarEspera = esperas.find((e) => e.id === sentarId);
  const mesasLibres = mesas.filter((m) => m.estado === "libre");

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
            {locale === "en" ? "waiting" : "en espera"}
            {cantidadMesas ? ` · ${cantidadMesas} mesas` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setReservaMesa(mesasLibres[0]?.numero ?? null);
              setReservaHorario(defaultHorarioInput());
              setReservaOpen(true);
            }}
            className="rounded-full border border-espera/40 bg-espera/10 px-5 py-2.5 text-sm font-semibold text-espera transition hover:bg-espera hover:text-crema"
          >
            {locale === "en" ? "+ Reservation" : "+ Reserva"}
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-full bg-espera px-5 py-2.5 text-sm font-semibold text-crema shadow-sm transition hover:bg-espera-fuerte"
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
          <div className="flex flex-wrap gap-3 text-[10px] font-semibold uppercase tracking-wide text-carbon/50">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-espera" />
              {locale === "en" ? "Free" : "Libre"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-amber-500" />
              {locale === "en" ? "Reserved" : "Reservada"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-carbon/45" />
              {locale === "en" ? "Busy" : "Ocupada"}
            </span>
          </div>
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
                disabled={libre}
                onClick={() => {
                  if (!libre) void liberarMesa(m.numero);
                }}
                title={
                  libre
                    ? locale === "en"
                      ? "Free"
                      : "Libre"
                    : reservada
                      ? locale === "en"
                        ? "Tap to cancel reservation"
                        : "Tocar para cancelar reserva"
                      : locale === "en"
                        ? "Tap to free"
                        : "Tocar para liberar"
                }
                className={`flex aspect-square flex-col items-center justify-center rounded-2xl border text-center transition ${
                  libre
                    ? "border-espera/50 bg-espera/20 text-espera shadow-[inset_0_0_0_1px_rgba(15,118,110,0.12)]"
                    : reservada
                      ? "border-amber-500/50 bg-amber-400/25 text-amber-950 hover:border-amber-600 hover:bg-amber-400/40 dark:bg-amber-400/20 dark:text-amber-100"
                      : "border-carbon/25 bg-carbon/15 text-carbon shadow-sm hover:border-espera/40 hover:bg-espera/10 dark:bg-carbon/40 dark:text-crema/80"
                }`}
              >
                <span className="font-display text-lg leading-none">
                  {m.numero}
                </span>
                <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">
                  {libre
                    ? locale === "en"
                      ? "Free"
                      : "Libre"
                    : reservada
                      ? locale === "en"
                        ? "Res."
                        : "Res."
                      : locale === "en"
                        ? "Busy"
                        : "Ocup."}
                </span>
                {reservada && reserva && (
                  <span className="mt-0.5 max-w-full truncate px-1 text-[9px] font-medium opacity-70">
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
          <p className="text-xs text-carbon/45">
            {locale === "en"
              ? "Auto-frees if they don’t arrive in time"
              : "Se libera sola si no llegan a tiempo"}
          </p>
        </div>
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
                <div className="flex flex-wrap gap-2">
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
                    className="rounded-full bg-carbon px-3 py-1.5 text-xs font-semibold text-crema transition hover:opacity-90"
                  >
                    {locale === "en" ? "Seat" : "Sentar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void cancelarReserva(r.id)}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-red-600/80 transition hover:bg-red-50"
                  >
                    {locale === "en" ? "Cancel" : "Cancelar"}
                  </button>
                </div>
              </div>
            </article>
          ))}
          {!reservasActivas.length && (
            <div className="rounded-[24px] border border-dashed border-amber-400/40 bg-amber-50/50 px-6 py-10 text-center dark:bg-amber-400/5">
              <p className="font-display text-lg uppercase text-amber-900/80 dark:text-amber-100/90">
                {locale === "en" ? "No reservations" : "Sin reservas"}
              </p>
              <p className="mt-1 text-sm text-carbon/50">
                {locale === "en"
                  ? "Add one instead of writing it on paper."
                  : "Agregá una en lugar de anotarla en papel."}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Cola */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-carbon/70">
          {locale === "en" ? "Waiting list" : "Cola de espera"}
        </h2>
        <div className="flex flex-col gap-3">
          {paginated.map((e) => (
            <article
              key={e.id}
              className={`rounded-[20px] border bg-surface p-4 shadow-sm ${
                e.estado === "avisado"
                  ? "border-espera/40 ring-1 ring-espera/20"
                  : "border-linea"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-xl uppercase tracking-tight text-carbon">
                      {e.nombre}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        e.estado === "avisado"
                          ? "bg-espera/15 text-espera"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {ETIQUETA_ESPERA[e.estado]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-carbon/55">
                    {e.personas} {locale === "en" ? "guests" : "personas"} ·{" "}
                    {minsAgo(e.creadoEn)} min
                    {e.empleado ? ` · ${e.empleado}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setQr(e)}
                    className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/70 transition hover:bg-crema"
                  >
                    QR
                  </button>
                  {e.estado === "esperando" && (
                    <button
                      type="button"
                      onClick={() => void avisar(e.id)}
                      className="rounded-full bg-espera px-3 py-1.5 text-xs font-semibold text-crema transition hover:bg-espera-fuerte"
                    >
                      {locale === "en" ? "Notify" : "Avisar"}
                    </button>
                  )}
                  {(e.estado === "esperando" || e.estado === "avisado") && (
                    <button
                      type="button"
                      onClick={() => setSentarId(e.id)}
                      disabled={!mesasLibres.length}
                      className="rounded-full bg-carbon px-3 py-1.5 text-xs font-semibold text-crema transition hover:opacity-90 disabled:opacity-40"
                    >
                      {locale === "en" ? "Seat" : "Sentar"}
                    </button>
                  )}
                  {!esperaClosed(e.estado) && (
                    <button
                      type="button"
                      onClick={() => void cancelar(e.id)}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold text-red-600/80 transition hover:bg-red-50"
                    >
                      {locale === "en" ? "Cancel" : "Cancelar"}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
          {!cola.length && (
            <div className="rounded-[24px] border border-dashed border-espera/30 bg-espera/5 px-6 py-12 text-center">
              <p className="font-display text-lg uppercase text-espera">
                {locale === "en" ? "No one waiting" : "Nadie en espera"}
              </p>
              <p className="mt-1 text-sm text-carbon/50">
                {locale === "en"
                  ? "Add a party when guests arrive."
                  : "Agregá un grupo cuando lleguen clientes."}
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
                placeholder="García"
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-carbon/70">
                {locale === "en" ? "Party size" : "Personas"}
              </span>
              <input
                type="number"
                min={1}
                max={50}
                className={INPUT}
                value={personas}
                onChange={(e) => setPersonas(Number(e.target.value) || 1)}
              />
            </label>
            <button
              type="button"
              disabled={creating}
              onClick={() => void onCrear()}
              className="mt-2 rounded-full bg-espera px-5 py-3 text-sm font-semibold text-crema transition hover:bg-espera-fuerte disabled:opacity-60"
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
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-carbon/70">
                {locale === "en" ? "Party size" : "Personas"}
              </span>
              <input
                type="number"
                min={1}
                max={50}
                className={INPUT}
                value={reservaPersonas}
                onChange={(e) =>
                  setReservaPersonas(Number(e.target.value) || 1)
                }
              />
            </label>
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
              {mesasLibres.length ? (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {mesasLibres.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setReservaMesa(m.numero)}
                      className={`flex aspect-square items-center justify-center rounded-2xl border font-display text-xl transition ${
                        reservaMesa === m.numero
                          ? "border-espera bg-espera text-crema"
                          : "border-espera/30 bg-espera/10 text-espera hover:bg-espera hover:text-crema"
                      }`}
                    >
                      {m.numero}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-carbon/50">
                  {locale === "en"
                    ? "No free tables right now."
                    : "No hay mesas libres ahora."}
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
              disabled={creatingReserva || !mesasLibres.length}
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

      {sentarId && (
        <ModalShell onClose={() => setSentarId(null)} labelledBy="sentar-title">
          <h2
            id="sentar-title"
            className="font-display text-xl uppercase tracking-tight text-carbon"
          >
            {locale === "en"
              ? `Seat ${sentarEspera?.nombre ?? ""}`
              : `Sentar a ${sentarEspera?.nombre ?? ""}`}
          </h2>
          <p className="mt-2 mb-3 text-sm text-carbon/55">
            {locale === "en" ? "Pick a free table" : "Elegí una mesa libre"}
          </p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {mesasLibres.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  if (!sentarId) return;
                  void sentar(sentarId, m.numero).then(() => {
                    setSentarId(null);
                    toast(
                      locale === "en"
                        ? `Seated at table ${m.numero}`
                        : `Sentados en mesa ${m.numero}`,
                      "success",
                    );
                  });
                }}
                className="flex aspect-square items-center justify-center rounded-2xl border border-espera/30 bg-espera/10 font-display text-xl text-espera transition hover:bg-espera hover:text-crema"
              >
                {m.numero}
              </button>
            ))}
          </div>
        </ModalShell>
      )}
    </div>
  );
};

export default EsperaPanelPage;

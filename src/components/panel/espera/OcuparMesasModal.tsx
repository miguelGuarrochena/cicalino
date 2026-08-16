"use client";

/* Extraído de app/(app)/panel/espera/page.tsx. Movido tal cual.
 *
 * Walk-in: alguien llega sin haber pasado por la cola y se lo sienta directo,
 * sin QR. Si el grupo no entra en la mesa que se tocó, abajo aparece el mapa
 * de mesas libres para juntar otra.
 *
 * La mesa "primaria" es la que se tocó en el mapa para abrir esto: no se puede
 * deseleccionar (sería quedarse sin punto de partida), y es la que ofrece el
 * atajo para editarle las plazas. */

import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import {
  AvisoReserva,
  AvisoBloqueoReserva,
} from "@/components/panel/espera/AvisoReserva";
import { PersonasChips } from "@/components/panel/espera/PersonasChips";
import { mesaTileClass } from "@/components/panel/espera/mesaTileClass";
import { isReservationHolding, reservationTime } from "@/lib/reservations";
import {
  tablesTitle,
  type ReservationView,
  type TableView,
} from "@/lib/types";

export const OcuparMesasModal = ({
  nombre,
  onNombre,
  personas,
  onPersonas,
  seleccion,
  onSeleccion,
  primaria,
  mesasLibres,
  reservaPorMesa,
  avisos,
  bloqueadas,
  mesaTomadaPorReserva,
  capacidad,
  faltan,
  puedeSentar,
  necesitaMapa,
  ocupando,
  ahora,
  locale,
  inputClass,
  onSentar,
  onEditarPlazas,
  onClose,
}: {
  nombre: string;
  onNombre: (v: string) => void;
  personas: number;
  onPersonas: (n: number) => void;
  seleccion: number[];
  onSeleccion: (fn: (prev: number[]) => number[]) => void;
  primaria: number | null;
  mesasLibres: TableView[];
  reservaPorMesa: Map<number, ReservationView>;
  avisos: { number: number; reserva: ReservationView }[];
  bloqueadas: number[];
  mesaTomadaPorReserva: Map<number, ReservationView>;
  capacidad: number;
  faltan: number;
  puedeSentar: boolean;
  necesitaMapa: boolean;
  ocupando: boolean;
  ahora: number;
  locale: string;
  inputClass: string;
  onSentar: () => void;
  onEditarPlazas: () => void;
  onClose: () => void;
}) => {
  const es = locale !== "en";
  const lang = es ? "es" : "en";
  const sinOtrasLibres = !mesasLibres.filter((m) => m.number !== primaria)
    .length;

  /* Con el alta en curso no se cierra: el usuario no sabría si quedó sentado. */
  const cerrarSiSePuede = () => {
    if (!ocupando) onClose();
  };

  const textoBoton = () => {
    if (ocupando) return "…";
    if (!puedeSentar && faltan > 0) {
      return es ? `Faltan ${faltan} plazas` : `Need ${faltan} more seats`;
    }
    if (avisos.length) return es ? "Sentar igual" : "Seat anyway";
    return es ? "Sentar" : "Seat";
  };

  return (
    <ModalShell
      onClose={cerrarSiSePuede}
      labelledBy="ocupar-title"
      busy={ocupando}
      busyLabel={es ? "Ocupando…" : "Seating…"}
      footer={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={ocupando || !puedeSentar}
            onClick={onSentar}
            className={`w-full rounded-full px-5 py-3.5 text-sm font-semibold text-crema transition disabled:opacity-40 ${
              avisos.length
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-espera hover:bg-espera-fuerte"
            }`}
          >
            {textoBoton()}
          </button>
          {primaria != null && (
            <button
              type="button"
              disabled={ocupando}
              onClick={onEditarPlazas}
              className="w-full rounded-full border border-linea px-5 py-3 text-sm font-semibold text-carbon transition hover:bg-crema disabled:opacity-50"
            >
              {es
                ? `Editar plazas (mesa ${primaria})`
                : `Edit seats (table ${primaria})`}
            </button>
          )}
          <button
            type="button"
            disabled={ocupando}
            onClick={onClose}
            className="w-full rounded-full border border-linea px-5 py-3.5 text-sm font-semibold text-carbon transition hover:bg-crema disabled:opacity-50"
          >
            {es ? "Cancelar" : "Cancel"}
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
            {primaria != null
              ? es
                ? `Sentar en mesa ${primaria}`
                : `Seat at table ${primaria}`
              : es
                ? "Sentar en una mesa"
                : "Seat now"}
          </h2>
          <p className="mt-1 text-sm text-carbon/55">
            {es
              ? "Walk-in: sin QR ni lista de espera."
              : "Walk-in: no QR, no waitlist."}
          </p>
        </div>
        <ModalCloseBtn
          disabled={ocupando}
          onClick={onClose}
          label={es ? "Cerrar" : "Close"}
        />
      </div>

      <AvisoBloqueoReserva
        mesas={bloqueadas}
        porMesa={mesaTomadaPorReserva}
        locale={locale}
      />
      <AvisoReserva avisos={avisos} locale={locale} ahora={ahora} />

      <label className="mt-4 flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-carbon/70">
          {es ? "Nombre (opcional)" : "Name (optional)"}
        </span>
        <input
          className={inputClass}
          value={nombre}
          disabled={ocupando}
          onChange={(e) => onNombre(e.target.value)}
          placeholder="Pérez"
          autoFocus
        />
      </label>

      <div className="mt-4 flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-carbon/70">
          {es ? "Personas" : "Party size"}
        </span>
        <PersonasChips value={personas} onChange={onPersonas} />
      </div>

      <div
        className={`mt-4 rounded-2xl border px-3 py-3 ${
          puedeSentar
            ? "border-espera/40 bg-espera/10"
            : "border-amber-300/60 bg-amber-50 dark:bg-amber-400/10"
        }`}
      >
        <p className="text-sm font-semibold text-carbon">
          {tablesTitle(seleccion, lang)}
          <span className="font-normal text-carbon/55">
            {" "}
            · {capacidad}/{personas} {es ? "plazas" : "seats"}
          </span>
        </p>
        <p
          className={`mt-1 text-sm font-semibold ${
            puedeSentar ? "text-espera" : "text-amber-800 dark:text-amber-200"
          }`}
        >
          {puedeSentar
            ? es
              ? "Entran todas."
              : "Fits the party."
            : es
              ? `Faltan ${faltan}, elegí otra mesa libre abajo.`
              : `Short ${faltan} — pick another free table below.`}
        </p>
      </div>

      {necesitaMapa && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/50">
            {es ? "Mesas libres para juntar" : "Free tables to join"}
          </p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {mesasLibres.map((m) => {
              const selected = seleccion.includes(m.number);
              const cap = m.capacity ?? 4;
              const esPrimaria = m.number === primaria;
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
                    onSeleccion((prev) =>
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
                      ? es
                        ? "Reserva"
                        : "Booked"
                      : selected
                        ? es
                          ? "Sí"
                          : "On"
                        : es
                          ? "Libre"
                          : "Free"}
                  </span>
                  <span className="mt-0.5 text-[9px] font-semibold opacity-80">
                    {cap}p
                  </span>
                </button>
              );
            })}
          </div>
          {sinOtrasLibres && (
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
              {es
                ? "No hay más mesas libres. Liberá una o bajá las personas."
                : "No other free tables. Free one or lower the party size."}
            </p>
          )}
        </div>
      )}
    </ModalShell>
  );
};

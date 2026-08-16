"use client";

/* Extraído de app/(app)/panel/espera/page.tsx. Movido tal cual.
 *
 * Reservar una mesa para más tarde. Es el modal más cargado de la pantalla
 * porque tiene que explicar por qué una mesa no se puede elegir, que no es
 * una sola razón:
 *
 *   - ya tiene otra reserva cerca de ese horario (choque)
 *   - está ocupada AHORA y el horario pedido es demasiado pronto
 *   - está ocupada ahora pero el horario es lo bastante lejos: se puede
 *
 * Los cálculos los hace la página y llegan acá ya resueltos: este componente
 * decide qué mostrar, no qué está libre. */

import Link from "next/link";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { PersonasChips } from "@/components/panel/espera/PersonasChips";
import { ReservaHorarioPicker } from "@/components/panel/espera/ReservaHorarioPicker";
import { mesaTileClass } from "@/components/panel/espera/mesaTileClass";
import { reservationTime, OCCUPIED_BOOKING_LEAD_MIN } from "@/lib/reservations";
import type { ReservationHours } from "@/lib/espera/slots";
import {
  tablesTitle,
  type ReservationView,
  type TableView,
} from "@/lib/types";

const AVISO =
  "mb-3 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 dark:bg-amber-400/15 dark:text-amber-100";

export const CrearReservaModal = ({
  nombre,
  onNombre,
  personas,
  onPersonas,
  horario,
  onHorario,
  hours,
  gracia,
  onGracia,
  mesas,
  mesasParaReserva,
  seleccion,
  onSeleccion,
  choquePorMesa,
  ocupadaPronto,
  capSeleccionada,
  capLibre,
  puedeCubrir,
  seleccionOk,
  faltan,
  cabeEnUna,
  desdeOcupada,
  creando,
  locale,
  inputClass,
  onGuardar,
  onClose,
}: {
  nombre: string;
  onNombre: (v: string) => void;
  personas: number;
  onPersonas: (n: number) => void;
  horario: string;
  onHorario: (v: string) => void;
  hours?: ReservationHours;
  gracia: 15 | 20;
  onGracia: (n: 15 | 20) => void;
  mesas: TableView[];
  mesasParaReserva: TableView[];
  seleccion: number[];
  onSeleccion: (fn: (prev: number[]) => number[]) => void;
  choquePorMesa: Map<number, ReservationView>;
  ocupadaPronto: Set<number>;
  capSeleccionada: number;
  capLibre: number;
  puedeCubrir: boolean;
  seleccionOk: boolean;
  faltan: number;
  cabeEnUna: boolean;
  desdeOcupada: string;
  creando: boolean;
  locale: string;
  inputClass: string;
  onGuardar: () => void;
  onClose: () => void;
}) => {
  const es = locale !== "en";
  const cerrarSiSePuede = () => {
    if (!creando) onClose();
  };

  /* El cartel de estado de las mesas. Es una cascada: primero los motivos por
   * los que no hay nada elegible, después si la selección alcanza. */
  const estadoMesas = () => {
    if (!mesas.length) {
      return (
        <p className={AVISO}>
          {es ? (
            <>
              No hay mesas configuradas. Definí la cantidad en{" "}
              <Link href="/panel/config" className="underline underline-offset-2">
                Configuración
              </Link>{" "}
              y guardá.
            </>
          ) : (
            <>
              No tables configured. Set the table count in{" "}
              <Link href="/panel/config" className="underline underline-offset-2">
                Settings
              </Link>{" "}
              and save.
            </>
          )}
        </p>
      );
    }
    if (!mesasParaReserva.length) {
      const soloPorOcupadas = ocupadaPronto.size && !choquePorMesa.size;
      return (
        <p className={AVISO}>
          {es
            ? soloPorOcupadas
              ? `Mesas ocupadas: no se puede reservar antes de las ${desdeOcupada}. Probá más tarde.`
              : "Todas las mesas ya tienen reserva a esa hora."
            : soloPorOcupadas
              ? `Busy tables can’t take a booking before ${desdeOcupada}. Pick a later time.`
              : "Every table is already booked around that time."}
        </p>
      );
    }
    if (!puedeCubrir) {
      return (
        <p className={AVISO}>
          {es
            ? `No alcanzan las plazas para ${personas} personas a esa hora (hay ${capLibre}). Probá otro horario o bajá el grupo.`
            : `Not enough seats for ${personas} people at that time (only ${capLibre} available). Try another time or lower the party size.`}
        </p>
      );
    }
    if (seleccionOk) {
      return (
        <p className="mb-3 text-sm font-semibold text-espera">
          {es
            ? `${capSeleccionada} / ${personas} plazas · ${tablesTitle(seleccion, "es")}`
            : `${capSeleccionada} / ${personas} seats · ${tablesTitle(seleccion, "en")}`}
        </p>
      );
    }
    return (
      <p className={AVISO}>
        {seleccion.length === 0
          ? cabeEnUna
            ? es
              ? `Elegí una mesa para ${personas} personas.`
              : `Pick a table for ${personas} people.`
            : es
              ? `Grupo de ${personas}: elegí 2 o más mesas.`
              : `Party of ${personas} needs 2+ tables — pick some to join.`
          : es
            ? `${capSeleccionada} / ${personas} plazas, faltan ${faltan}. Juntá otra mesa.`
            : `${capSeleccionada} / ${personas} seats — still short ${faltan}. Join another table.`}
      </p>
    );
  };

  return (
    <ModalShell
      onClose={cerrarSiSePuede}
      labelledBy="reserva-crear-title"
      busy={creando}
      busyLabel={es ? "Guardando…" : "Saving…"}
      footer={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={creando || !seleccionOk}
            onClick={onGuardar}
            className="w-full rounded-full bg-espera px-5 py-3.5 text-sm font-semibold text-crema transition hover:bg-espera-fuerte disabled:opacity-60"
          >
            {creando ? "…" : es ? "Guardar reserva" : "Save reservation"}
          </button>
          <button
            type="button"
            disabled={creando}
            onClick={onClose}
            className="w-full rounded-full border border-linea px-5 py-3.5 text-sm font-semibold text-carbon transition hover:bg-crema disabled:opacity-60"
          >
            {es ? "Cancelar" : "Cancel"}
          </button>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id="reserva-crear-title"
          className="font-display text-xl uppercase tracking-tight text-carbon"
        >
          {es ? "Nueva reserva" : "New reservation"}
        </h2>
        <ModalCloseBtn
          disabled={creando}
          onClick={onClose}
          label={es ? "Cerrar" : "Close"}
        />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-carbon/70">
            {es ? "Nombre" : "Name"}
          </span>
          <input
            className={inputClass}
            value={nombre}
            onChange={(e) => onNombre(e.target.value)}
            placeholder="Martínez"
            autoFocus
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-carbon/70">
            {es ? "Personas" : "Party size"}
          </span>
          <PersonasChips value={personas} onChange={onPersonas} />
        </div>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-carbon/70">
            {es ? "Día y hora" : "Date & time"}
          </span>
          <ReservaHorarioPicker
            value={horario}
            onChange={onHorario}
            locale={locale}
            hours={hours}
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-carbon/70">
            {es ? "Mesa" : "Table"}
          </legend>
          <p className="mb-2 text-xs text-carbon/45">
            {es
              ? cabeEnUna
                ? `Elegí una mesa que entre al grupo. Si está ocupada ahora, recién desde las ${desdeOcupada} (+${OCCUPIED_BOOKING_LEAD_MIN} min).`
                : `Ninguna mesa sola alcanza: juntá 2 o más. Ocupadas: recién desde las ${desdeOcupada}.`
              : cabeEnUna
                ? `Pick a table that fits. Busy tables need +${OCCUPIED_BOOKING_LEAD_MIN} min (from ${desdeOcupada}).`
                : `No single table fits — join 2 or more. Busy tables need +${OCCUPIED_BOOKING_LEAD_MIN} min.`}
          </p>

          {estadoMesas()}

          {mesas.length ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {mesas.map((m) => {
                const choque = choquePorMesa.get(m.number);
                const pronto = ocupadaPronto.has(m.number);
                const elegible = !choque && !pronto;
                const selected = seleccion.includes(m.number);
                const cap = m.capacity ?? 4;
                const oversized = elegible && cap > personas;
                const ocupadaOk = m.status === "ocupada" && elegible;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!elegible}
                    title={
                      choque
                        ? es
                          ? `Reservada ${reservationTime(choque.scheduledAt)} — ${choque.name}`
                          : `Booked ${reservationTime(choque.scheduledAt)} — ${choque.name}`
                        : pronto
                          ? es
                            ? `Ocupada ahora — reservá desde las ${desdeOcupada}`
                            : `Busy now — book from ${desdeOcupada}`
                          : ocupadaOk
                            ? es
                              ? "Ocupada ahora · ok para este horario"
                              : "Busy now · ok for this later time"
                            : undefined
                    }
                    onClick={() => {
                      if (!elegible) return;
                      onSeleccion((prev) =>
                        prev.includes(m.number)
                          ? prev.filter((n) => n !== m.number)
                          : [...prev, m.number].sort((a, b) => a - b),
                      );
                    }}
                    className={
                      choque
                        ? "relative flex aspect-square cursor-not-allowed flex-col items-center justify-center rounded-2xl border-2 border-amber-600 bg-amber-400 text-center text-amber-950 opacity-70"
                        : pronto
                          ? "relative flex aspect-square cursor-not-allowed flex-col items-center justify-center rounded-2xl border-2 border-rose-500 bg-rose-500/90 text-center text-white opacity-80"
                          : mesaTileClass(ocupadaOk ? "ocupada" : "libre", {
                              pickable: true,
                              selected,
                              selectedAmber: true,
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
                        : pronto
                          ? es
                            ? "Ocup."
                            : "Busy"
                          : ocupadaOk
                            ? es
                              ? "Ocup. · ok"
                              : "Busy · later ok"
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
          ) : (
            <p className="text-sm text-carbon/50">
              {es ? "No hay mesas configuradas." : "No tables configured."}
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-carbon/70">
            {es ? "Espera después del horario" : "Hold after time"}
          </legend>
          <div className="flex gap-2">
            {([15, 20] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onGracia(m)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  gracia === m
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
  );
};

"use client";

/* Extraído de app/(app)/panel/espera/page.tsx. Movido tal cual.
 *
 * Anotar a alguien en la cola: nombre y cuántos son. El alta la hace el padre
 * (`onCrear`), que es el que sabe de la base y del QR que se muestra después. */

import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { PersonasChips } from "@/components/panel/espera/PersonasChips";

export const CrearEsperaModal = ({
  nombre,
  onNombre,
  personas,
  onPersonas,
  creando,
  onCrear,
  onClose,
  locale,
  inputClass,
}: {
  nombre: string;
  onNombre: (v: string) => void;
  personas: number;
  onPersonas: (n: number) => void;
  creando: boolean;
  onCrear: () => void;
  onClose: () => void;
  locale: string;
  /* La clase del input la define la página: es la misma que usa el resto de
   * la pantalla. */
  inputClass: string;
}) => {
  const es = locale !== "en";
  /* Con el alta en curso el modal no se cierra: si no, el usuario lo cierra a
   * mitad de camino y no sabe si quedó anotado. */
  const cerrarSiSePuede = () => {
    if (!creando) onClose();
  };

  return (
    <ModalShell
      onClose={cerrarSiSePuede}
      labelledBy="espera-crear-title"
      busy={creando}
      busyLabel={es ? "Creando…" : "Creating…"}
      footer={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={creando || !nombre.trim()}
            onClick={onCrear}
            className="w-full rounded-full bg-espera px-5 py-3.5 text-sm font-semibold text-crema transition hover:bg-espera-fuerte disabled:opacity-60"
          >
            {creando ? "…" : es ? "Crear y mostrar QR" : "Create & show QR"}
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
          id="espera-crear-title"
          className="font-display text-xl uppercase tracking-tight text-carbon"
        >
          {es ? "Agregar a la espera" : "Add to waitlist"}
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
            onKeyDown={(e) => {
              if (e.key === "Enter") onCrear();
            }}
            placeholder="García"
            autoFocus
          />
        </label>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-carbon/70">
            {es ? "Personas" : "Party size"}
          </span>
          <PersonasChips value={personas} onChange={onPersonas} />
        </div>
      </div>
    </ModalShell>
  );
};

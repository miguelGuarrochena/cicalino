"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";

/* Confirmar y pedir un dato, con la cara de Cicalino.
 *
 * Reemplaza a `window.confirm` y `window.prompt`. Los nativos funcionaban,
 * pero no son nuestros: el navegador los pinta con su tipografía, los ancla
 * arriba del todo, ignoran el tema oscuro, dicen "localhost:3000 dice" y en
 * iOS tapan media pantalla. En una tablet de salón, el cartel que pregunta
 * "¿cancelo este pedido?" tiene que verse igual de serio que el resto de la
 * app — y una acción destructiva merece un botón rojo, no el "Aceptar" gris
 * del sistema.
 *
 * Devuelve una promesa a propósito. Así el que llama conserva la forma que ya
 * tenía con el nativo —`if (!(await confirmar(...))) return;`— y no hay que
 * dar vuelta cada componente en máquinas de estado para mostrar un cartel.
 *
 * Con `input` hace de prompt y devuelve el texto (o null si cancelan). Sin
 * `input`, devuelve true/false. */

export interface ConfirmInput {
  label: string;
  placeholder?: string;
  maxLength?: number;
  /* Para el caso "acá está el texto, copialo": arranca con el valor puesto y
   * seleccionado. */
  valorInicial?: string;
  /* Sin texto no deja confirmar. Es lo que pide el motivo de una anulación. */
  requerido?: boolean;
}

export interface ConfirmOpts {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /* "peligro" para lo que borra o cancela algo que ya existe. */
  tone?: "normal" | "peligro";
  input?: ConfirmInput;
}

type Pendiente = {
  opts: ConfirmOpts;
  resolve: (v: boolean | string | null) => void;
};

interface ConfirmFn {
  (opts: ConfirmOpts & { input: ConfirmInput }): Promise<string | null>;
  (opts: ConfirmOpts): Promise<boolean>;
}

const Ctx = createContext<ConfirmFn | null>(null);

export const ConfirmProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useApp();
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [texto, setTexto] = useState("");
  const enVuelo = useRef<Pendiente | null>(null);

  const pedir = useCallback((opts: ConfirmOpts) => {
    return new Promise<boolean | string | null>((resolve) => {
      /* Dos preguntas encimadas no pueden pasar —el modal atrapa el foco—,
       * pero si pasara, la anterior se responde que no en vez de quedar
       * colgada para siempre. */
      enVuelo.current?.resolve(opts.input ? null : false);
      const p = { opts, resolve };
      enVuelo.current = p;
      setTexto(opts.input?.valorInicial ?? "");
      setPendiente(p);
    });
  }, []) as ConfirmFn;

  const cerrar = (valor: boolean | string | null) => {
    enVuelo.current = null;
    pendiente?.resolve(valor);
    setPendiente(null);
    setTexto("");
  };

  const opts = pendiente?.opts;
  const esperaTexto = Boolean(opts?.input);
  const faltaTexto = Boolean(opts?.input?.requerido) && !texto.trim();

  return (
    <Ctx.Provider value={pedir}>
      {children}
      {opts && (
        <ModalShell
          onClose={() => cerrar(esperaTexto ? null : false)}
          labelledBy="confirm-title"
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => cerrar(esperaTexto ? null : false)}
                className="min-h-12 rounded-full border border-linea px-6 text-sm font-semibold text-carbon/70 transition hover:bg-carbon/5 sm:min-w-32"
              >
                {opts.cancelLabel ?? t("acciones.cancelar")}
              </button>
              <button
                type="button"
                disabled={faltaTexto}
                onClick={() => cerrar(esperaTexto ? texto.trim() : true)}
                className={`min-h-12 rounded-full px-6 text-sm font-semibold text-crema transition disabled:opacity-50 sm:min-w-32 ${
                  opts.tone === "peligro"
                    ? "bg-alerta hover:opacity-90"
                    : "bg-marca hover:bg-marca-fuerte"
                }`}
              >
                {opts.confirmLabel ?? t("acciones.confirmar")}
              </button>
            </div>
          }
        >
          <div className="flex items-start justify-between gap-3">
            <h2
              id="confirm-title"
              className={`font-display text-2xl uppercase tracking-tight ${
                opts.tone === "peligro" ? "text-alerta" : "text-carbon"
              }`}
            >
              {opts.title}
            </h2>
            <ModalCloseBtn
              onClick={() => cerrar(esperaTexto ? null : false)}
              label={opts.cancelLabel ?? t("acciones.cancelar")}
            />
          </div>
          {opts.body && (
            <p className="mt-3 text-sm leading-snug text-carbon/70">{opts.body}</p>
          )}
          {opts.input && (
            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-carbon/70">
                {opts.input.label}
              </span>
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                maxLength={opts.input.maxLength ?? 200}
                placeholder={opts.input.placeholder}
                autoFocus
                onFocus={(e) => {
                  if (opts.input?.valorInicial) e.currentTarget.select();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !faltaTexto) cerrar(texto.trim());
                }}
                className="min-h-12 rounded-xl border border-linea bg-crema/40 px-4 text-carbon outline-none placeholder:text-carbon/40 focus:border-marca focus:ring-2 focus:ring-marca/20"
              />
            </label>
          )}
        </ModalShell>
      )}
    </Ctx.Provider>
  );
};

/* Fuera del provider devuelve "que no", que es lo seguro: nunca borra algo
 * porque el cartel no se pudo mostrar. */
const sinProvider = ((opts: ConfirmOpts) =>
  Promise.resolve(opts.input ? null : false)) as ConfirmFn;

export const useConfirm = (): ConfirmFn => useContext(Ctx) ?? sinProvider;

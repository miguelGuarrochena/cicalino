"use client";

import type { ReactNode } from "react";

export type NoticeTone = "ok" | "curso" | "alerta" | "marca";

/* Las bandas de aviso del comensal: confirmaciones, esperas y errores.
 *
 * Cada una traía sus propios colores de Tailwind —`bg-emerald-50`,
 * `bg-amber-100`, `bg-red-50`, `text-red-600`— con un `dark:` al lado que
 * nunca se aplicaba, porque el comensal fuerza `data-theme="light"` y el
 * variante `dark` está atado a ese atributo. Sobre un local de fondo bordó o
 * terracota quedaban recuadros claros flotando, y el `text-red-600` suelto del
 * formulario daba 1.04:1 sobre verde: invisible justo cuando hay que leerlo.
 *
 * Acá el color sale de los tokens de estado, que `[data-scheme="dark"]` ya
 * ajusta según el fondo del local. Y el texto va siempre en `--text`, que está
 * medido contra el `surface` de cada marca: el tono pinta el borde y el ícono,
 * nunca la palabra que hay que leer. Eso también resuelve lo de no depender
 * solo del color — cada tono trae su propia forma. */
const TONOS: Record<NoticeTone, { caja: string; icono: string; glifo: ReactNode }> = {
  ok: {
    caja: "border-ok-borde bg-ok-fondo",
    icono: "text-ok",
    glifo: <path d="m4.5 12.5 5 5 10-11" />,
  },
  curso: {
    caja: "border-curso-borde bg-curso-fondo",
    icono: "text-curso",
    glifo: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  alerta: {
    caja: "border-alerta-borde bg-alerta-fondo",
    icono: "text-alerta",
    glifo: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5v.01" />
      </>
    ),
  },
  marca: {
    caja: "border-marca/35 bg-marca/10",
    icono: "text-marca",
    glifo: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5.5M12 7.5v.01" />
      </>
    ),
  },
};

export const CustomerNotice = ({
  tone,
  children,
  role = "status",
  className = "",
  onClose,
  closeLabel,
}: {
  tone: NoticeTone;
  children: ReactNode;
  /* `alert` interrumpe al lector de pantalla; `status` espera su turno. */
  role?: "status" | "alert";
  className?: string;
  /* Los avisos que confirman algo se quedaban para siempre: "Pedido
   * cancelado" seguía arriba de la pantalla una hora después, mientras la
   * mesa pagaba. Con esto se pueden sacar de encima. Los que explican una
   * situación —la mesa cerrada, el pago en verificación— no lo reciben: no
   * son un mensaje, son el estado. */
  onClose?: () => void;
  closeLabel?: string;
}) => {
  const { caja, icono, glifo } = TONOS[tone];
  return (
    <div
      role={role}
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-base leading-snug text-carbon ${caja} ${className}`.trim()}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={`mt-0.5 shrink-0 ${icono}`}
      >
        {glifo}
      </svg>
      <div className="min-w-0 flex-1">{children}</div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel ?? "Cerrar"}
          className="-my-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-carbon"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="m7 7 10 10M17 7 7 17" />
          </svg>
        </button>
      ) : null}
    </div>
  );
};

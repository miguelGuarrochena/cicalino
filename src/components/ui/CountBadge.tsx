"use client";

/* El número que avisa cuánto trabajo hay esperando.
 *
 * Estaba escrito tres veces —la barra de arriba, la de abajo y las pestañas—
 * y en las tres con 10 px de letra metidos adentro del botón. Ese tamaño
 * funciona como detalle decorativo y falla como notificación: el mozo mira el
 * menú de reojo desde la otra punta del salón y no lo ve.
 *
 * Ahora es uno solo, del tamaño de una notificación de verdad y asomado por
 * el borde del botón, que es donde el ojo lo busca.
 *
 * Dos cosas que no hace a propósito:
 *
 *  · no crece sin límite — a partir de 100 dice "99+", así el botón no se
 *    deforma en una noche de treinta comandas;
 *  · no late siempre. `pulse` lo decide quien lo usa, porque no todo número
 *    es trabajo: en Recepción "12" son las mesas que hay, no doce cosas que
 *    resolver. Un número que late sin pedir nada enseña a ignorarlo.
 */

/* `espera` y `pagos` son los colores de esos dos módulos: el globo de cada
 * sección late del color de su sección, así el número se lee como "de acá" sin
 * tener que buscar de qué botón salió. `text-crema` es el fondo de la página,
 * que es claro en tema claro y oscuro en tema oscuro: por eso contrasta contra
 * el relleno lleno en los dos, sin una regla por tema. */
type Tone = "marca" | "espera" | "pagos" | "curso" | "alerta";

const FONDO: Record<Tone, string> = {
  marca: "bg-marca text-crema",
  espera: "bg-espera text-crema",
  pagos: "bg-pagos text-crema",
  curso: "bg-curso text-crema",
  alerta: "bg-alerta text-crema",
};

const HALO: Record<Tone, string> = {
  marca: "u-alert-halo u-alert-halo-marca",
  espera: "u-alert-halo u-alert-halo-espera",
  pagos: "u-alert-halo u-alert-halo-pagos",
  curso: "u-alert-halo u-alert-halo-curso",
  alerta: "u-alert-halo",
};

export const CountBadge = ({
  n,
  tone = "marca",
  pulse = false,
  className = "",
}: {
  n: number;
  tone?: Tone;
  /* Late solo cuando el número es trabajo sin atender. */
  pulse?: boolean;
  /* Dónde se cuelga: lo decide quien lo usa, porque la esquina no es la misma
   * en una píldora de la barra que en una pestaña cuadrada. */
  className?: string;
}) => {
  if (n <= 0) return null;
  return (
    <span
      aria-hidden
      className={`pointer-events-none flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[13px] font-bold leading-none tabular-nums ring-2 ring-crema sm:h-7 sm:min-w-7 sm:text-sm ${
        FONDO[tone]
      } ${pulse ? `u-alert-beat ${HALO[tone]}` : ""} ${className}`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
};

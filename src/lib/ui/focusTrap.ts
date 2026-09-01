/* Utilidades del foco para ModalShell.
 *
 * Van separadas del componente porque la parte con reglas —qué cuenta como
 * enfocable y a dónde salta el Tab en los bordes— se puede probar sin DOM. El
 * componente solo cablea estas dos funciones a los eventos.
 */

/* Lo que el navegador pone en el orden de tabulación, sin lo deshabilitado ni
 * lo que se sacó a mano con tabindex="-1". `details` y `iframe` no aparecen en
 * los modales del panel, así que no están. */
export const SELECTOR_ENFOCABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/* Un elemento con `hidden` o dentro de un contenedor oculto sigue matcheando
 * el selector pero no se puede enfocar; saltearlo evita que el Tab caiga en un
 * agujero. `offsetParent` es null cuando está fuera de pantalla, salvo en
 * position: fixed, de ahí el segundo chequeo. */
export const esEnfocable = (el: HTMLElement): boolean => {
  if (el.hasAttribute("hidden")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  return el.offsetParent !== null || getComputedStyle(el).position === "fixed";
};

export const enfocablesDe = (contenedor: HTMLElement): HTMLElement[] =>
  Array.from(
    contenedor.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLE),
  ).filter(esEnfocable);

/* A dónde mandar el foco cuando se aprieta Tab.
 *
 * Devuelve null cuando no hay que intervenir: si el foco está en el medio de
 * la lista, el navegador ya hace lo correcto y preventDefault solo serviría
 * para reimplementar peor lo que ya funciona. Solo se toma el control en los
 * bordes —para envolver— y cuando el foco se escapó del modal.
 */
export const siguienteFoco = <T>(
  lista: readonly T[],
  actual: T | null,
  shift: boolean,
): T | null => {
  if (lista.length === 0) return null;
  const i = actual === null ? -1 : lista.indexOf(actual);
  /* El foco quedó afuera (o en el contenedor mismo): se lo trae de vuelta al
   * extremo por el que venía entrando. */
  if (i === -1) return shift ? lista[lista.length - 1] : lista[0];
  if (!shift && i === lista.length - 1) return lista[0];
  if (shift && i === 0) return lista[lista.length - 1];
  return null;
};

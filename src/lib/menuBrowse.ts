import type { GuestMenuProduct } from "@/components/customer/table/TableGuestApp";

/* Recorrer una carta larga sin perderse.
 *
 * Una carta de 10 categorías con 15 platos cada una son 150 tarjetas en una
 * sola columna: para llegar a los postres hay que pasar por todo. Acá vive lo
 * que hace falta para saltar y para buscar, separado de la pantalla porque es
 * donde están las decisiones que se pueden equivocar —el orden de los
 * resultados, los acentos, cuándo aparece el buscador— y las quiero medibles. */

export interface MenuCategory {
  /* Sirve de `id` en el DOM, así que tiene que ser único y válido. */
  id: string;
  nombre: string;
  items: GuestMenuProduct[];
}

/* Sin acentos y en minúscula: quien escribe desde el teléfono, apurado y con
 * el teclado predictivo en contra, pone "milanesa" o "jamon". Que la carta
 * diga "Milanesa" o "jamón" no es problema del comensal. */
export const normalizar = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const slug = (nombre: string): string => {
  const base = normalizar(nombre)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  /* Una categoría llamada "🍷" o "…" se queda sin letras. */
  return base || "cat";
};

/* Agrupa respetando el orden en que vino el menú: el servidor ya lo ordenó
 * por categoría y por posición, y ese orden es el que armó el local. */
export const agruparPorCategoria = (
  menu: GuestMenuProduct[],
  sinCategoria: string,
): MenuCategory[] => {
  const porNombre = new Map<string, GuestMenuProduct[]>();
  for (const p of menu) {
    const k = p.category?.trim() || sinCategoria;
    porNombre.set(k, [...(porNombre.get(k) ?? []), p]);
  }
  const usados = new Set<string>();
  return [...porNombre.entries()].map(([nombre, items]) => {
    /* Dos categorías distintas pueden dar el mismo slug ("Para compartir" y
     * "para-compartir"). Un `id` repetido rompe el salto: el navegador va
     * siempre al primero. */
    let id = slug(nombre);
    if (usados.has(id)) {
      let n = 2;
      while (usados.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    usados.add(id);
    return { id, nombre, items };
  });
};

/* Desde cuántos platos el buscador deja de ser adorno.
 *
 * Con 20 productos se recorre la carta entera en tres pantallazos y un campo
 * de texto es una cosa más que entender. De 30 para arriba, buscar "flan" es
 * más rápido que cualquier índice. El número es un criterio, no una ley: está
 * acá para poder discutirlo en un solo lugar. */
export const MENU_CON_BUSCADOR = 30;

/* Desde cuántas categorías conviene el índice. Con dos, el salto cuesta más
 * que el scroll. */
export const CARTA_CON_INDICE = 3;

export interface Hallazgo {
  producto: GuestMenuProduct;
  /* De qué categoría salió: en una lista de resultados mezclados, saber que el
   * "Flan" es de Postres y no de Promos evita el segundo viaje. */
  categoria: string;
}

/* Busca por nombre y, si no, por descripción.
 *
 * El orden importa más que el filtro: quien escribe "mila" quiere la milanesa
 * primero, no el sándwich cuya descripción la menciona. Van tres tramos —el
 * nombre empieza con lo buscado, el nombre lo contiene, la descripción lo
 * contiene— y adentro de cada uno se respeta el orden de la carta. */
export const buscarPlatos = (
  categorias: MenuCategory[],
  q: string,
): Hallazgo[] => {
  const term = normalizar(q.trim());
  if (!term) return [];

  const empieza: Hallazgo[] = [];
  const contiene: Hallazgo[] = [];
  const enDescripcion: Hallazgo[] = [];

  for (const c of categorias) {
    for (const producto of c.items) {
      const nombre = normalizar(producto.name);
      const h = { producto, categoria: c.nombre };
      if (nombre.startsWith(term)) empieza.push(h);
      else if (nombre.includes(term)) contiene.push(h);
      else if (producto.description && normalizar(producto.description).includes(term)) {
        enDescripcion.push(h);
      }
    }
  }
  return [...empieza, ...contiene, ...enDescripcion];
};

/* Cuál es la categoría que se está mirando.
 *
 * `tops` son las posiciones de cada título respecto de la ventana, y `corte`
 * es dónde termina lo que está pegado arriba. La activa es la última que ya
 * pasó el corte: mientras el título de Postres no llegue ahí, seguís en
 * Principales aunque se asome el primer postre.
 *
 * Devuelve el índice y no el id para que la pantalla no tenga que buscar. Si
 * todavía no pasó ninguna —estás arriba de todo— la activa es la primera. */
export const categoriaActiva = (tops: number[], corte: number): number => {
  let activa = 0;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] - corte <= 1) activa = i;
    else break;
  }
  return activa;
};

import type { GuestMenuProduct } from "@/components/customer/table/TableGuestApp";
import { notaAlEscribir, notaLimpia, precioDeLinea } from "@/lib/dishChoice";

/* El pedido que todavía no salió de la mesa.
 *
 * Hasta acá el carrito era un `Record<id, cantidad>` suelto en la pantalla, y
 * el botón que decía "Pedir 2 · $19.600" lo mandaba a la cocina de una. Las
 * cantidades solo se veían desperdigadas al lado de cada plato: si tocaste el
 * `+` de más mientras hacías scroll, te enterabas cuando llegó.
 *
 * Nada de esto cambia cómo se manda —la clave de idempotencia y el endpoint
 * son los de siempre—; lo que cambia es que ahora hay algo que se puede mirar
 * antes, y eso necesita cuentas propias y medibles.
 *
 * Un mismo plato puede ir dos veces si las opciones son distintas (una
 * milanesa chica y una grande). La aclaración es de ese renglón. */

/* Tope por producto y opción. Es el de siempre: doce empanadas son un pedido,
 * cincuenta es un error de dedo. */
export const MAX_POR_PRODUCTO = 50;

export const clampCantidad = (q: number): number =>
  Math.max(0, Math.min(MAX_POR_PRODUCTO, Math.trunc(q) || 0));

export interface CartSlot {
  cantidad: number;
  nota: string;
  opcion: string | null;
}

/* La clave conserva el orden de inserción. El separador no puede aparecer en
 * un UUID ni en el nombre de una opción. */
const SEP = "\u001f";

export type Cart = Record<string, CartSlot>;

export const claveLinea = (productId: string, opcion: string | null): string =>
  opcion ? `${productId}${SEP}${opcion}` : productId;

export const idDeClave = (clave: string): string => clave.split(SEP)[0] ?? clave;

export interface CartLine {
  clave: string;
  producto: GuestMenuProduct;
  cantidad: number;
  opcion: string | null;
  nota: string;
  precioUnitario: number;
  subtotal: number;
}

/* Las líneas del pedido, en el orden en que se fueron agregando.
 *
 * El orden sale de las claves del objeto, que en JavaScript conservan el orden
 * de inserción: lo primero que tocaste queda arriba. Un producto que bajó a
 * cero y volvió a subir se queda en su lugar original, que es lo que espera
 * quien está corrigiendo una cantidad y no quiere que la lista le baile. */
export const lineasDelCarrito = (
  cart: Cart,
  productos: Map<string, GuestMenuProduct>,
): CartLine[] =>
  Object.entries(cart).flatMap(([clave, slot]) => {
    if (slot.cantidad <= 0) return [];
    const producto = productos.get(idDeClave(clave));
    if (!producto) return [];
    const precioUnitario = precioDeLinea(producto.price, producto.choice, slot.opcion);
    if (precioUnitario == null) return [];
    return [
      {
        clave,
        producto,
        cantidad: slot.cantidad,
        opcion: slot.opcion,
        nota: slot.nota,
        precioUnitario,
        subtotal: precioUnitario * slot.cantidad,
      },
    ];
  });

export const totalCarrito = (lineas: CartLine[]): number =>
  lineas.reduce((s, l) => s + l.subtotal, 0);

/* Cuántas unidades, no cuántos renglones: tres empanadas y una provoleta son
 * cuatro cosas para la cocina, no dos. */
export const itemsCarrito = (lineas: CartLine[]): number =>
  lineas.reduce((s, l) => s + l.cantidad, 0);

/* Lo que muestra el `+` de la carta: la suma de todas las opciones de ese plato. */
export const cantidadesPorProducto = (cart: Cart): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [clave, slot] of Object.entries(cart)) {
    if (slot.cantidad <= 0) continue;
    const id = idDeClave(clave);
    out[id] = (out[id] ?? 0) + slot.cantidad;
  }
  return out;
};

export const sumar = (
  cart: Cart,
  productId: string,
  opcion: string | null,
  nota: string,
  n = 1,
): Cart => {
  const clave = claveLinea(productId, opcion);
  const prev = cart[clave] ?? { cantidad: 0, nota: "", opcion };
  const limpia = notaLimpia(nota);
  return {
    ...cart,
    [clave]: {
      cantidad: clampCantidad(prev.cantidad + n),
      nota: limpia || prev.nota,
      opcion,
    },
  };
};

export const fijarCantidad = (cart: Cart, clave: string, q: number): Cart => {
  const prev = cart[clave];
  if (!prev) return cart;
  return { ...cart, [clave]: { ...prev, cantidad: clampCantidad(q) } };
};

export const fijarNota = (cart: Cart, clave: string, nota: string): Cart => {
  const prev = cart[clave];
  if (!prev) return cart;
  return { ...cart, [clave]: { ...prev, nota: notaAlEscribir(nota) } };
};

/* El `−` de la carta saca uno del renglón que se agregó último. */
export const restarUltima = (cart: Cart, productId: string): Cart => {
  const claves = Object.keys(cart).filter(
    (k) => idDeClave(k) === productId && (cart[k]?.cantidad ?? 0) > 0,
  );
  const clave = claves[claves.length - 1];
  if (!clave) return cart;
  return fijarCantidad(cart, clave, cart[clave]!.cantidad - 1);
};

export type ItemParaEnviar = {
  productId: string;
  quantity: number;
  option?: string;
  note?: string;
};

/* Lo que viaja al servidor. Sale de las líneas ya filtradas, así que un
 * producto que quedó en cero —o uno que desapareció de la carta mientras la
 * mesa lo miraba— no se manda. El precio no viaja: lo vuelve a leer la base. */
export const itemsParaEnviar = (lineas: CartLine[]): ItemParaEnviar[] =>
  lineas.map((l) => {
    const note = notaLimpia(l.nota);
    return {
      productId: l.producto.id,
      quantity: l.cantidad,
      ...(l.opcion ? { option: l.opcion } : {}),
      ...(note ? { note } : {}),
    };
  });

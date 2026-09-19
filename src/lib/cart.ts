import type { GuestMenuProduct } from "@/components/customer/table/TableGuestApp";

/* El pedido que todavía no salió de la mesa.
 *
 * Hasta acá el carrito era un `Record<id, cantidad>` suelto en la pantalla, y
 * el botón que decía "Pedir 2 · $19.600" lo mandaba a la cocina de una. Las
 * cantidades solo se veían desperdigadas al lado de cada plato: si tocaste el
 * `+` de más mientras hacías scroll, te enterabas cuando llegó.
 *
 * Nada de esto cambia cómo se manda —la clave de idempotencia y el endpoint
 * son los de siempre—; lo que cambia es que ahora hay algo que se puede mirar
 * antes, y eso necesita cuentas propias y medibles. */

/* Tope por producto. Es el de siempre: doce empanadas son un pedido, cincuenta
 * es un error de dedo. */
export const MAX_POR_PRODUCTO = 50;

export const clampCantidad = (q: number): number =>
  Math.max(0, Math.min(MAX_POR_PRODUCTO, Math.trunc(q) || 0));

export interface CartLine {
  producto: GuestMenuProduct;
  cantidad: number;
  subtotal: number;
}

/* Las líneas del pedido, en el orden en que se fueron agregando.
 *
 * El orden sale de las claves del objeto, que en JavaScript conservan el orden
 * de inserción: lo primero que tocaste queda arriba. Un producto que bajó a
 * cero y volvió a subir se queda en su lugar original, que es lo que espera
 * quien está corrigiendo una cantidad y no quiere que la lista le baile. */
export const lineasDelCarrito = (
  cart: Record<string, number>,
  productos: Map<string, GuestMenuProduct>,
): CartLine[] =>
  Object.entries(cart)
    .filter(([id, q]) => q > 0 && productos.has(id))
    .map(([id, q]) => {
      const producto = productos.get(id)!;
      return { producto, cantidad: q, subtotal: producto.price * q };
    });

/* Cuánta plata es. El precio unitario viene del menú que bajó el servidor, así
 * que es el mismo con el que se va a facturar: acá no se inventa nada. */
export const totalCarrito = (lineas: CartLine[]): number =>
  lineas.reduce((s, l) => s + l.subtotal, 0);

/* Cuántas unidades, no cuántos renglones: tres empanadas y una provoleta son
 * cuatro cosas para la cocina, no dos. */
export const itemsCarrito = (lineas: CartLine[]): number =>
  lineas.reduce((s, l) => s + l.cantidad, 0);

/* Lo que viaja al servidor. Sale de las líneas ya filtradas, así que un
 * producto que quedó en cero —o uno que desapareció de la carta mientras la
 * mesa lo miraba— no se manda. */
export const itemsParaEnviar = (
  lineas: CartLine[],
): { productId: string; quantity: number }[] =>
  lineas.map((l) => ({ productId: l.producto.id, quantity: l.cantidad }));

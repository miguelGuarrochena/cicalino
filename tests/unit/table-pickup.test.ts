import { describe, it, expect } from "vitest";
import {
  mapPickupOrder,
  mapPickupState,
  newlyReady,
  pickupActive,
  pickupPaying,
  pickupPaymentFailed,
  pickupStage,
  sortToCharge,
  type PickupOrder,
} from "@/lib/tablePickup";
import type { OrderStatus } from "@/lib/types";

/* Lo que devuelve mesa_autoservicio_estado / pedidos_por_cobrar, traducido a
 * lo que muestran el teléfono del cliente y la caja. */

const rawOrder = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  referencia: "14",
  alias: "Sofía",
  estado: "pendiente_pago",
  mesa_numero: 5,
  comensal_id: "22222222-2222-4222-8222-222222222222",
  creado_en: "2026-09-22T20:00:00.000Z",
  confirmado_en: null,
  listo_en: null,
  retirado_en: null,
  cancelado_en: null,
  avisado_en: null,
  pago_caja_en: null,
  total: 12000,
  items: [
    { id: "i1", nombre: "Milanesa", precio_unitario: 9000, cantidad: 1, subtotal: 9000 },
    { id: "i2", nombre: "Agua", precio_unitario: 1500, cantidad: 2, subtotal: 3000 },
  ],
  pago: null,
  ...over,
});

const order = (over: Record<string, unknown> = {}): PickupOrder =>
  mapPickupOrder(rawOrder(over))!;

describe("mapPickupOrder", () => {
  it("trae mesa, total, ítems y cobro", () => {
    const o = order({
      pago: {
        id: "p1",
        metodo: "mercado_pago",
        estado: "pendiente",
        monto_total: 12000,
        expira_en: "2026-09-22T20:30:00.000Z",
        mp_estado: null,
        confirmado_en: null,
        creado_por: "comensal",
      },
    });
    expect(o.reference).toBe("14");
    expect(o.tableNumber).toBe(5);
    expect(o.total).toBe(12000);
    expect(o.items).toHaveLength(2);
    expect(o.items[1]).toMatchObject({ name: "Agua", quantity: 2, subtotal: 3000 });
    expect(o.payment).toMatchObject({ id: "p1", method: "mercado_pago", status: "pendiente" });
  });

  it("descarta basura", () => {
    expect(mapPickupOrder(null)).toBeNull();
    expect(mapPickupOrder({ referencia: "1" })).toBeNull();
  });
});

describe("mapPickupState", () => {
  it("sin credencial: la mesa y sus pedidos vivos, sin identidad", () => {
    const s = mapPickupState({
      ok: true,
      mesa: { id: "m1", numero: 5 },
      operativo: true,
      comensal: null,
      sesion_abierta: false,
      pedidos: [],
      mesa_pedidos: [
        { referencia: "12", estado: "listo", creado_en: "2026-09-22T19:00:00Z", total: 5000 },
      ],
    })!;
    expect(s.guest).toBeNull();
    expect(s.canOrder).toBe(false);
    expect(s.table.number).toBe(5);
    expect(s.tableOrders).toEqual([
      { reference: "12", status: "listo", createdAt: "2026-09-22T19:00:00Z", total: 5000 },
    ]);
  });

  it("con credencial: el comensal y sus pedidos", () => {
    const s = mapPickupState({
      ok: true,
      mesa: { id: "m1", numero: 5 },
      operativo: true,
      comensal: { id: "c1", nombre: "Sofía", sesion_id: "s1" },
      sesion_abierta: true,
      pedidos: [rawOrder()],
      mesa_pedidos: [],
    })!;
    expect(s.guest).toEqual({ id: "c1", name: "Sofía", sessionId: "s1" });
    expect(s.canOrder).toBe(true);
    expect(s.orders).toHaveLength(1);
  });

  it("una respuesta de error no es un estado", () => {
    expect(mapPickupState({ ok: false, reason: "not-found" })).toBeNull();
    expect(mapPickupState(null)).toBeNull();
  });
});

describe("pickupStage — los estados que ve el cliente", () => {
  const casos: [OrderStatus, string][] = [
    ["pendiente_pago", "esperando-pago"],
    ["creado", "en-preparacion"],
    ["en_preparacion", "en-preparacion"],
    ["listo", "listo"],
    ["retirado", "retirado"],
    ["cancelado", "cancelado"],
  ];
  it.each(casos)("%s → %s", (status, stage) => {
    expect(pickupStage(status)).toBe(stage);
  });

  it("retirado y cancelado ya no están en juego", () => {
    expect(pickupActive("retirado")).toBe(false);
    expect(pickupActive("cancelado")).toBe(false);
    expect(pickupActive("pendiente_pago")).toBe(true);
    expect(pickupActive("listo")).toBe(true);
  });
});

describe("pickupPaying — cómo está pagando un pedido que espera", () => {
  const now = new Date("2026-09-22T20:10:00.000Z").getTime();
  const mp = (estado: string, expira = "2026-09-22T20:30:00.000Z") => ({
    id: "p1",
    metodo: "mercado_pago",
    estado,
    monto_total: 12000,
    expira_en: expira,
    mp_estado: null,
    confirmado_en: null,
    creado_por: "comensal",
  });

  it("eligió pagar en caja", () => {
    expect(pickupPaying(order({ pago_caja_en: "2026-09-22T20:01:00Z" }), now)).toBe("caja");
  });

  it("con el checkout de Mercado Pago abierto", () => {
    expect(pickupPaying(order({ pago: mp("pendiente") }), now)).toBe("mercado_pago");
  });

  it("un checkout vencido deja elegir de nuevo", () => {
    expect(
      pickupPaying(order({ pago: mp("pendiente", "2026-09-22T20:05:00.000Z") }), now),
    ).toBe("sin-elegir");
  });

  it("uno rechazado cuenta como fallido", () => {
    const o = order({ pago: mp("cancelado") });
    expect(pickupPaying(o, now)).toBe("sin-elegir");
    expect(pickupPaymentFailed(o)).toBe(true);
  });

  it("un pedido pago no está pagando nada", () => {
    expect(pickupPaying(order({ estado: "creado", pago_caja_en: "x" }), now)).toBe("sin-elegir");
    expect(pickupPaymentFailed(order({ estado: "creado", pago: mp("cancelado") }))).toBe(false);
  });
});

describe("newlyReady — lo que hace sonar el teléfono", () => {
  it("suena solo por lo que pasó a listo con la pantalla abierta", () => {
    const antes = new Map<string, OrderStatus>([
      ["a", "en_preparacion"],
      ["b", "listo"],
    ]);
    const ahora = [
      order({ id: "a", estado: "listo" }),
      order({ id: "b", estado: "listo" }),
      order({ id: "c", estado: "listo" }),
    ];
    /* b ya estaba listo; c no se había visto antes (abrió la pantalla así). */
    expect(newlyReady(antes, ahora)).toEqual(["a"]);
  });
});

describe("sortToCharge — la caja", () => {
  it("primero los que vienen a pagar a la caja, por orden de llegada", () => {
    const lista = sortToCharge([
      order({ id: "mp", creado_en: "2026-09-22T19:00:00Z" }),
      order({ id: "caja2", pago_caja_en: "2026-09-22T20:05:00Z" }),
      order({ id: "caja1", pago_caja_en: "2026-09-22T20:01:00Z" }),
    ]);
    expect(lista.map((o) => o.id)).toEqual(["caja1", "caja2", "mp"]);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  needsTableCount,
  parsePedidosModalidad,
  pedidosEnMesa,
  pedidosMostradorQr,
  pedidosPorQr,
  usesTableMenu,
} from "@/lib/modules";
import { branchOperacionSchema, pickupOrderSchema } from "@/lib/schemas";
import {
  counterCanPay,
  counterPayState,
  mapPickupOrder,
  mapPickupState,
  pickupStage,
  type PickupOrder,
} from "@/lib/tablePickup";
import { informativeQrCopy, secondGroupStart } from "@/lib/qrInformativo";

/* Pedidos en modalidad Mostrador QR, del lado de la app: la modalidad, lo que
 * ve el cliente (preparación y pago por separado) y las piezas que reutiliza. */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const soloPedidos = { pedidos: true, espera: false, pagos: false };

const pedido = (over: Partial<PickupOrder> = {}): PickupOrder => ({
  id: "p1",
  reference: "123",
  alias: null,
  status: "creado",
  flow: "mostrador_qr",
  tableNumber: null,
  guestId: "c1",
  createdAt: "2026-09-25T12:00:00Z",
  confirmedAt: "2026-09-25T12:00:00Z",
  readyAt: null,
  pickedUpAt: null,
  cancelledAt: null,
  notifiedAt: null,
  payAtCounterAt: null,
  total: 8500,
  items: [],
  payment: null,
  ...over,
});

describe("Mostrador QR — la modalidad", () => {
  it("es una tercera modalidad y la de siempre sigue siendo el default", () => {
    expect(parsePedidosModalidad("mostrador_qr")).toBe("mostrador_qr");
    expect(parsePedidosModalidad("mesa")).toBe("sin_mostrador");
    expect(parsePedidosModalidad(undefined)).toBe("mostrador");
    expect(branchOperacionSchema.safeParse({
      modo: "pedido",
      tableCount: 10,
      cutoffHour: 6,
      reservaAbreMin: 660,
      reservaCierraMin: 1380,
      diasCerrados: [],
      pedidosModalidad: "mostrador_qr",
    }).success).toBe(true);
  });

  it("no es Mesa, pero usa carta y cobros como Mesa", () => {
    expect(pedidosMostradorQr(soloPedidos, "mostrador_qr")).toBe(true);
    expect(pedidosEnMesa(soloPedidos, false)).toBe(false);
    expect(pedidosPorQr(soloPedidos, "mostrador_qr", false)).toBe(true);
    expect(pedidosPorQr(soloPedidos, "mostrador", false)).toBe(false);
    expect(usesTableMenu(soloPedidos, "mostrador_qr", false)).toBe(true);
    expect(pedidosMostradorQr({ pedidos: false }, "mostrador_qr")).toBe(false);
  });

  it("no pide cantidad de mesas", () => {
    expect(needsTableCount(soloPedidos, "pedido", false)).toBe(false);
    expect(needsTableCount(soloPedidos, "pedido", true)).toBe(true);
  });
});

describe("Mostrador QR — lo que devuelve la base", () => {
  it("el estado viene sin mesa, con el local", () => {
    const s = mapPickupState({
      ok: true,
      mesa: null,
      local: { id: "l1", nombre: "Panadería" },
      operativo: true,
      comensal: { id: "c1", nombre: null, sesion_id: "s1" },
      sesion_abierta: true,
      pedidos: [{ id: "p1", referencia: "7", estado: "listo", flujo: "mostrador_qr", total: 900 }],
      mesa_pedidos: [],
    })!;
    expect(s.flow).toBe("mostrador_qr");
    expect(s.table).toBeNull();
    expect(s.canOrder).toBe(true);
    expect(s.guest?.id).toBe("c1");
    expect(s.orders[0]?.flow).toBe("mostrador_qr");
  });

  it("un pedido de la mesa sigue siendo de la mesa", () => {
    expect(mapPickupOrder({ id: "p", referencia: "1", estado: "creado" })?.flow).toBe(
      "autoservicio",
    );
  });
});

describe("Mostrador QR — preparación y pago por separado", () => {
  it("recién hecho se ve 'recibido'; en la mesa, 'en preparación'", () => {
    expect(pickupStage("creado", "mostrador_qr")).toBe("recibido");
    expect(pickupStage("en_preparacion", "mostrador_qr")).toBe("en-preparacion");
    expect(pickupStage("listo", "mostrador_qr")).toBe("listo");
    expect(pickupStage("creado")).toBe("en-preparacion");
  });

  it("pagado manda sobre todo lo demás", () => {
    const o = pedido({
      status: "listo",
      payAtCounterAt: "2026-09-25T12:00:00Z",
      payment: {
        id: "g",
        method: "efectivo",
        status: "pagado",
        total: 8500,
        expiresAt: null,
        mpStatus: null,
        confirmedAt: "2026-09-25T12:30:00Z",
        createdBy: "personal",
      },
    });
    expect(counterPayState(o)).toBe("pagado");
    expect(counterCanPay(o)).toBe(false);
  });

  it("en caja: pendiente hasta que lo cobren, aunque ya esté listo", () => {
    const o = pedido({ status: "listo", payAtCounterAt: "2026-09-25T12:00:00Z" });
    expect(counterPayState(o)).toBe("caja");
    expect(counterCanPay(o)).toBe(true);
  });

  it("Mercado Pago en curso, y vencido sin aprobar", () => {
    const now = Date.parse("2026-09-25T12:10:00Z");
    const mp = {
      id: "g",
      method: "mercado_pago" as const,
      status: "pendiente" as const,
      total: 8500,
      expiresAt: "2026-09-25T12:30:00Z",
      mpStatus: null,
      confirmedAt: null,
      createdBy: "comensal" as const,
    };
    expect(counterPayState(pedido({ payment: mp }), now)).toBe("mercado_pago");
    expect(counterPayState(pedido({ payment: { ...mp, expiresAt: "2026-09-25T12:05:00Z" } }), now)).toBe(
      "sin-pagar",
    );
    expect(counterPayState(pedido({ payment: { ...mp, status: "cancelado" } }), now)).toBe(
      "sin-pagar",
    );
  });

  it("retirado o cancelado ya no se paga desde el teléfono", () => {
    expect(counterCanPay(pedido({ status: "retirado" }))).toBe(false);
    expect(counterCanPay(pedido({ status: "cancelado" }))).toBe(false);
  });
});

describe("Mostrador QR — el pedido que manda el teléfono", () => {
  const base = {
    key: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    items: [{ productId: "7c9e6679-7425-40de-944b-e07fc1f90ae8", quantity: 2 }],
    method: "caja",
  };

  it("el nombre es opcional y vacío es sin nombre", () => {
    expect(pickupOrderSchema.parse(base).name).toBeUndefined();
    expect(pickupOrderSchema.parse({ ...base, name: "" }).name).toBeNull();
    expect(pickupOrderSchema.parse({ ...base, name: "  Miguel " }).name).toBe("Miguel");
    expect(pickupOrderSchema.safeParse({ ...base, name: "M" }).success).toBe(false);
  });
});

describe("Mostrador QR — reutiliza lo que ya existe", () => {
  it("el cartel explica el flujo en dos grupos", () => {
    const copy = informativeQrCopy((k) => k, "mostrador_qr");
    expect(copy.title).toBe("mostradorQr.cartel.titulo");
    expect(copy.orderSteps).toHaveLength(3);
    expect(copy.paySteps).toHaveLength(2);
    expect(secondGroupStart(copy)).toBe(4);
  });

  it("el QR del local entra por la misma página y las mismas rutas", () => {
    const page = read("src/app/(customer)/m/[token]/page.tsx");
    expect(page).toContain("resolvePickupAccess(token, creds)");
    expect(page).toContain("qr={{ ...counter, tableNumber: null }}");
    const pedidos = read("src/app/api/m/[token]/autoservicio/pedidos/route.ts");
    expect(pedidos).toContain("placeCounterOrder(token, creds, items, key, method, name ?? null)");
    expect(read("src/app/api/m/[token]/restaurar/route.ts")).toContain(
      'fetchPickupState(token, creds, "mostrador_qr")',
    );
  });

  it("QR regenerado: seguimiento y pago sí, pedido nuevo no", () => {
    const page = read("src/app/(customer)/m/[token]/page.tsx");
    expect(page).not.toContain("currentCounterToken");
    const pedidos = read("src/app/api/m/[token]/autoservicio/pedidos/route.ts");
    expect(pedidos).toContain("const qr = await resolvePickupQr(token);");
    expect(pedidos).toContain('failure(stale ? "qr-vencido" : qr.reason)');
    const pago = read("src/app/api/m/[token]/autoservicio/pedidos/[pedidoId]/pago/route.ts");
    expect(pago).toContain("resolvePickupAccess(token, creds)");
    const unirse = read("src/app/api/m/[token]/autoservicio/unirse/route.ts");
    expect(unirse).toContain("resolvePickupQr(token)");
    expect(unirse).not.toContain("resolvePickupAccess");
    const app = read("src/components/customer/table/TablePickupApp.tsx");
    expect(app).toContain('const qrStale = counter && state?.qrValid === false;');
    expect(app).toContain("&& !qrStale");
  });

  it("el push de listo abre el pedido, no el QR vigente del local", () => {
    const notify = read("src/app/api/push/notify/route.ts");
    expect(notify).toContain("if (mostradorQr) url = `/m/${pedido.qr_token}`;");
    expect(notify).not.toContain("mostrador_qr_token");
    /* Mesa no cambia: sigue yendo al QR de la mesa. */
    expect(notify).toContain("else if (mesaToken) url = `/m/${mesaToken}`;");
    const app = read("src/components/customer/table/TablePickupApp.tsx");
    expect(app).toContain("{qrStale && !state?.orderLink && (");
  });

  it("el estado dice si el QR sigue vigente", () => {
    const base = { ok: true, mesa: null, local: { id: "l1", nombre: "Pan" }, pedidos: [] };
    expect(mapPickupState({ ...base, qr_vigente: false })?.qrValid).toBe(false);
    expect(mapPickupState(base)?.qrValid).toBe(true);
    expect(mapPickupState(base)?.branch).toEqual({ id: "l1", name: "Pan" });
    expect(mapPickupState({ ...base, qr_vigente: false, pedido_link: true })?.orderLink).toBe(true);
    expect(mapPickupState(base)?.orderLink).toBe(false);
  });

  it("el aviso de notificaciones sale de la capacidad, no del sistema operativo", () => {
    const src = read("src/lib/notifications.ts");
    const body = src.slice(src.indexOf("export const webPushAvailable"));
    const fn = body.slice(0, body.indexOf("\n};"));
    expect(fn).toContain("pushManagerSupported()");
    expect(fn).not.toMatch(/isIos|userAgent|Android/);
  });

  it("el tablero cobra con el modal de siempre", () => {
    const page = read("src/app/(app)/panel/pedidos/page.tsx");
    expect(page).toContain("<ChargeModal");
    expect(page).toContain("onCobrar={enMostradorQr && live ? setCharging : undefined}");
  });
});

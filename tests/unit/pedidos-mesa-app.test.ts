import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  needsTableCount,
  parsePedidosModalidad,
  pedidosEnMesa,
  usesTableMenu,
} from "@/lib/modules";
import {
  branchOperacionSchema,
  counterChargeMethodSchema,
  pickupOrderSchema,
  pickupPaySchema,
} from "@/lib/schemas";
import { ALERT_META, cajaAlerts, sortAlerts, counterAlerts } from "@/lib/panelAlerts";
import { informativeQrCopy, secondGroupStart } from "@/lib/qrInformativo";
import { translate } from "@/lib/i18n";

/* Pedidos en modalidad Mesa, del lado de la app: configuración, validación,
 * avisos, cartel y el cableado de las rutas. */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const soloPedidos = { pedidos: true, espera: false, pagos: false };

describe("modalidad de Pedidos", () => {
  it("la de siempre es mostrador, y cualquier otra cosa también", () => {
    expect(parsePedidosModalidad("mesa")).toBe("mesa");
    expect(parsePedidosModalidad("mostrador")).toBe("mostrador");
    expect(parsePedidosModalidad(null)).toBe("mostrador");
    expect(parsePedidosModalidad("otra")).toBe("mostrador");
  });

  it("es de Pedidos: sin el módulo no hay modalidad Mesa", () => {
    expect(pedidosEnMesa(soloPedidos, "mesa")).toBe(true);
    expect(pedidosEnMesa({ pedidos: false }, "mesa")).toBe(false);
    expect(pedidosEnMesa(soloPedidos, "mostrador")).toBe(false);
  });

  it("en modalidad Mesa hace falta saber cuántas mesas hay", () => {
    expect(needsTableCount(soloPedidos, "pedido")).toBe(false);
    expect(needsTableCount(soloPedidos, "pedido", "mesa")).toBe(true);
    /* La de siempre no cambia. */
    expect(needsTableCount(soloPedidos, "mesa")).toBe(true);
    expect(needsTableCount(soloPedidos, "nombre", "mostrador")).toBe(false);
  });

  it("carta y cobros: Pagos, o Pedidos en modalidad Mesa", () => {
    expect(usesTableMenu(soloPedidos, "mostrador")).toBe(false);
    expect(usesTableMenu(soloPedidos, "mesa")).toBe(true);
    expect(usesTableMenu({ pedidos: false, espera: false, pagos: true }, "mostrador")).toBe(true);
  });

  it("se guarda con la operación de la sucursal, con default mostrador", () => {
    const base = {
      modo: "pedido",
      tableCount: 10,
      cutoffHour: 6,
      reservaAbreMin: 660,
      reservaCierraMin: 1380,
      diasCerrados: [],
    };
    expect(branchOperacionSchema.parse(base).pedidosModalidad).toBe("mostrador");
    expect(branchOperacionSchema.parse({ ...base, pedidosModalidad: "mesa" }).pedidosModalidad).toBe(
      "mesa",
    );
    expect(branchOperacionSchema.safeParse({ ...base, pedidosModalidad: "delivery" }).success).toBe(
      false,
    );
    const branch = read("src/lib/data/branch.ts");
    expect(branch).toContain("pedidos_modalidad: v.data.pedidosModalidad");
    expect(branch).toContain("pedidosModalidad: parsePedidosModalidad(data.pedidos_modalidad)");
  });
});

describe("validación de lo que manda el teléfono y la caja", () => {
  const item = { productId: "11111111-1111-4111-8111-111111111111", quantity: 2 };
  const key = "22222222-2222-4222-8222-222222222222";

  it("el pedido sale con la forma de pago: caja o Mercado Pago", () => {
    expect(pickupOrderSchema.safeParse({ key, items: [item], method: "caja" }).success).toBe(true);
    expect(pickupOrderSchema.safeParse({ key, items: [item], method: "mercado_pago" }).success).toBe(
      true,
    );
    expect(pickupOrderSchema.safeParse({ key, items: [item], method: "efectivo" }).success).toBe(false);
    expect(pickupOrderSchema.safeParse({ key, items: [], method: "caja" }).success).toBe(false);
    expect(pickupPaySchema.safeParse({ method: "tarjeta_credito" }).success).toBe(false);
  });

  it("no manda precios: el total lo calcula la base", () => {
    const parsed = pickupOrderSchema.parse({
      key,
      items: [{ ...item, price: 1 }],
      method: "caja",
      total: 1,
    });
    expect(parsed).not.toHaveProperty("total");
    expect(parsed.items[0]).not.toHaveProperty("price");
  });

  it("la caja nunca cobra 'Mercado Pago online' a mano", () => {
    expect(counterChargeMethodSchema.options).not.toContain("mercado_pago");
    expect(counterChargeMethodSchema.options).toContain("efectivo");
    expect(counterChargeMethodSchema.options).toContain("qr_mercado_pago");
  });
});

describe("aviso de la caja", () => {
  it("avisa solo lo que eligió pagar en caja, con la mesa", () => {
    const alerts = cajaAlerts([
      { id: "a", reference: "14", tableNumber: 5, payAtCounterAt: "2026-09-22T20:00:00Z" },
      { id: "b", reference: "15", tableNumber: 2, payAtCounterAt: null },
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      id: "cobro-caja:a",
      kind: "cobro-caja",
      source: "pedidos",
      href: "/panel/pedidos",
      table: 5,
    });
  });

  it("va antes que un pedido nuevo del mostrador", () => {
    expect(ALERT_META["cobro-caja"].priority).toBeGreaterThan(ALERT_META["pedido-mostrador"].priority);
    const ordenadas = sortAlerts([
      ...counterAlerts([{ id: "x", reference: "3", createdAt: "2026-09-22T20:10:00Z" }]),
      ...cajaAlerts([{ id: "a", reference: "14", tableNumber: 5, payAtCounterAt: "2026-09-22T20:00:00Z" }]),
    ]);
    expect(ordenadas[0]!.kind).toBe("cobro-caja");
    expect(translate("es", ALERT_META["cobro-caja"].titleKey, { n: 5 })).toBe(
      "Mesa 5 viene a pagar a la caja",
    );
  });
});

describe("cartel imprimible de la modalidad Mesa", () => {
  const t = (k: string) => translate("es", k);

  it("explica el flujo: confirmar pagando, se prepara después, se retira en el mostrador", () => {
    const copy = informativeQrCopy(t, "autoservicio");
    expect(copy.title).toBe("Confirmá tu pedido");
    expect(copy.orderSteps).toEqual([
      "Escaneá el QR",
      "Elegí tu pedido",
      "Confirmalo pagando con Mercado Pago o en caja",
    ]);
    expect(copy.orderNote).toBe("Tu pedido se prepara después de confirmar el pago.");
    expect(copy.paySteps).toEqual(["Te avisamos cuando esté listo", "Retiralo en el mostrador"]);
    expect(secondGroupStart(copy)).toBe(4);
  });

  it("el cartel de Pagos queda igual", () => {
    const copy = informativeQrCopy(t);
    expect(copy.title).toBe(translate("es", "mesasQr.cartelTitulo"));
    expect(copy.paySteps).toHaveLength(4);
  });

  it("el PNG y el papel numeran igual y usan el mismo cartel", () => {
    expect(read("src/lib/qrSticker.ts")).toContain("secondGroupStart(copy)");
    expect(read("src/components/panel/mesas/InformativeQrCard.tsx")).toContain(
      "start={secondGroupStart(copy)}",
    );
    expect(read("src/app/(app)/panel/pedidos/qr/page.tsx")).toContain('flow="autoservicio"');
    expect(read("src/app/(app)/panel/pagos/qr/page.tsx")).toContain('flow="cuenta"');
  });
});

describe("cableado del flujo", () => {
  it("el QR de la mesa abre la app de retiro en modalidad Mesa", () => {
    const page = read("src/app/(customer)/m/[token]/page.tsx");
    expect(page).toContain('mesa.flow === "autoservicio"');
    expect(page).toContain("<TablePickupApp");
  });

  it("las rutas del comensal validan origen, rate limit y cookie", () => {
    for (const r of [
      "src/app/api/m/[token]/autoservicio/unirse/route.ts",
      "src/app/api/m/[token]/autoservicio/pedidos/route.ts",
      "src/app/api/m/[token]/autoservicio/pedidos/[pedidoId]/pago/route.ts",
      "src/app/api/m/[token]/autoservicio/pedidos/[pedidoId]/cancelar/route.ts",
      "src/app/api/m/[token]/autoservicio/avisos/route.ts",
    ]) {
      const src = read(r);
      expect(src, r).toContain("guardGuestRequest");
      expect(src, r).toContain("mutating: true");
    }
    for (const r of [
      "src/app/api/m/[token]/autoservicio/pedidos/route.ts",
      "src/app/api/m/[token]/autoservicio/pedidos/[pedidoId]/pago/route.ts",
      "src/app/api/m/[token]/autoservicio/pedidos/[pedidoId]/cancelar/route.ts",
      "src/app/api/m/[token]/autoservicio/avisos/route.ts",
    ]) {
      expect(read(r), r).toContain('return failure("no-guest")');
    }
  });

  it("Mercado Pago usa el checkout y el webhook de siempre", () => {
    const server = read("src/lib/server/tablePickup.ts");
    expect(server).toContain("startGuestMercadoPagoCheckout(token, paymentId");
    expect(server).not.toContain("createPreference(");
    expect(read("src/app/api/mp/webhook/route.ts")).toContain("confirmMercadoPagoPayment");
  });

  it("el aviso de listo le llega al comensal y lo lleva al QR de la mesa", () => {
    const notify = read("src/app/api/push/notify/route.ts");
    expect(notify).toContain("comensal_id.eq.${pedido.comensal_id}");
    expect(notify).toContain("url = `/m/${mesaToken}`");
    expect(read("src/app/api/m/[token]/autoservicio/avisos/route.ts")).toContain(
      "comensal_id: state.state.guest.id",
    );
  });

  it("la caja ve lo que tiene que cobrar solo en modalidad Mesa", () => {
    const page = read("src/app/(app)/panel/pedidos/page.tsx");
    expect(page).toContain('useConfigStore((s) => s.pedidosModalidad === "mesa")');
    expect(page).toContain("<PickupChargeInbox");
    expect(page).toContain("enMesa && visibles.pedidos");
  });

  it("el tablero sigue sin poder marcar listo un pedido sin pagar", () => {
    const card = read("src/components/panel/OrderCard.tsx");
    expect(card).toContain('order.status === "creado" || order.status === "en_preparacion"');
  });
});

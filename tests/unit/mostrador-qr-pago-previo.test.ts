/**
 * Mostrador QR: "Requerir pago antes de preparar el pedido".
 *
 * Lo que se puede fijar sin base: que la migración parte de las versiones
 * vigentes y cambia solo lo necesario, que la opción viaja por la
 * configuración de siempre, y que el panel y el cliente reutilizan lo de
 * Mesa. El comportamiento contra la base está en
 * tests/integration/mostrador-qr-pago-previo.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { branchOperacionSchema } from "@/lib/schemas";
import { newlyConfirmed, type PickupOrder } from "@/lib/tablePickup";
import { ALERT_META, cajaAlerts } from "@/lib/panelAlerts";
import { translate } from "@/lib/i18n";
import type { OrderStatus } from "@/lib/types";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const sql = read("supabase/mostrador-qr-pago-previo.sql");

/* El cuerpo de una función tal como queda en un archivo. */
const funcion = (src: string, nombre: string): string => {
  const i = src.indexOf(`create or replace function public.${nombre}(`);
  if (i < 0) return "";
  const fin = src.indexOf("\n$$;", i);
  return src.slice(i, fin + 4);
};

describe("mostrador-qr-pago-previo.sql", () => {
  it("agrega la opción apagada por defecto", () => {
    expect(sql).toContain(
      "add column if not exists mostrador_qr_pago_previo boolean not null default false",
    );
  });

  it("va después de pedidos-modalidades-combinables y está en el chequeo de migraciones", () => {
    const orden = JSON.parse(read("supabase/orden.json")) as string[];
    expect(orden.indexOf("mostrador-qr-pago-previo.sql")).toBe(
      orden.indexOf("pedidos-modalidades-combinables.sql") + 1,
    );
    const chequeo = read("supabase/chequeo-migraciones.sql");
    expect(chequeo).toContain("'locales.mostrador_qr_pago_previo'");
    expect(chequeo).toContain("('mostrador-qr-pago-previo.sql', 'pedidos-modalidades-combinables.sql')");
  });

  it("redefine solo las funciones que cambian, y no vuelve a crear liberar_mesas_jornada", () => {
    const definidas = [...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
    expect(definidas.sort()).toEqual(
      [
        "_cerrar_sesion",
        "cobrar_pedido_autoservicio",
        "mp_confirmar_pago",
        "pedidos_autoservicio_guard",
        "pedir_mostrador_qr",
      ].sort(),
    );
    expect(sql).not.toContain("liberar_mesas_jornada(");
    expect(sql).not.toContain("function public.cancelar_pedido_autoservicio");
    expect(sql).not.toContain("function public.pagar_pedido_autoservicio");
  });

  it("parte de las versiones vigentes: fuera de lo agregado, cada función es la misma", () => {
    /* Cuántas líneas de la versión vigente se reemplazan a propósito. */
    const vigente: [string, string, number][] = [
      ["pedir_mostrador_qr", "supabase/pedidos-mostrador-qr-metodos.sql", 5],
      ["pedidos_autoservicio_guard", "supabase/pedidos-mostrador-qr.sql", 2],
      ["mp_confirmar_pago", "supabase/pedidos-mostrador-qr.sql", 0],
      ["cobrar_pedido_autoservicio", "supabase/pedidos-mostrador-qr.sql", 0],
      ["_cerrar_sesion", "supabase/pedidos-mesa.sql", 1],
    ];
    for (const [nombre, archivo, reemplazadas] of vigente) {
      const antes = funcion(read(archivo), nombre).split("\n");
      const ahora = new Set(funcion(sql, nombre).split("\n"));
      /* Toda línea de la versión vigente sigue, salvo las que se
       * reemplazaron a propósito. */
      const faltan = antes.filter((l) => !ahora.has(l));
      expect(faltan.length, `${nombre}: ${faltan.join(" | ")}`).toBe(reemplazadas);
    }
  });

  it("el estado inicial lo decide la base con la opción, leída bajo el lock del local", () => {
    const f = funcion(sql, "pedir_mostrador_qr");
    expect(f).toContain("coalesce(l.mostrador_qr_pago_previo, false)");
    expect(f).toContain("into v_corte, v_cerrados, v_pago_previo");
    expect(f).toContain(
      "case when v_pago_previo then 'pendiente_pago' else 'creado' end::public.order_status",
    );
  });

  it("la guardia acepta solo el estado inicial que corresponde y no relaja la salida de pendiente_pago", () => {
    const g = funcion(sql, "pedidos_autoservicio_guard");
    expect(g).toContain("hint = 'mostrador-pago-previo'");
    expect(g).toContain("hint = 'mostrador-creado'");
    expect(g).toContain("new.confirmado_en := null;");
    expect(g).toContain("hint = 'pedido-sin-pagar'");
    expect(g).toContain("if v_total <= 0 or v_pagado < v_total then");
    expect(g).toContain("hint = 'ya-confirmado'");
  });

  it("Mercado Pago y la caja lo pasan a creado por el estado del pedido, no por la opción", () => {
    for (const nombre of ["mp_confirmar_pago", "cobrar_pedido_autoservicio"]) {
      const f = funcion(sql, nombre);
      const rama = f.slice(f.indexOf("_marcar_pedido_pagado"));
      expect(rama).toMatch(/set estado = 'creado'\s+where id = v_p\.(pedido_id|id) and estado = 'pendiente_pago'/);
      expect(f).not.toContain("mostrador_qr_pago_previo");
    }
    /* Un pedido cancelado no se cubre: queda como excedente. */
    expect(funcion(sql, "mp_confirmar_pago")).toContain("then v_ped.estado <> 'cancelado'");
  });

  it("el cierre de sesión cancela lo que nadie pagó también en el mostrador", () => {
    const f = funcion(sql, "_cerrar_sesion");
    expect(f).toContain("if v_s.flujo in ('autoservicio', 'mostrador_qr') then");
    expect(f).toContain("where sesion_id = v_s.id and estado = 'pendiente_pago'");
  });
});

describe("la opción en la configuración", () => {
  const base = {
    modo: "pedido",
    pedidosModalidad: "mostrador_qr",
    tableCount: 10,
    cutoffHour: 6,
  };

  it("apagada si no viene, y se guarda cuando viene", () => {
    const sinOpcion = branchOperacionSchema.parse(base);
    expect(sinOpcion.mostradorQrPagoPrevio).toBe(false);
    expect(branchOperacionSchema.parse({ ...base, mostradorQrPagoPrevio: true }).mostradorQrPagoPrevio).toBe(true);
  });

  it("se lee y se escribe con el resto de la operación del local", () => {
    const branch = read("src/lib/data/branch.ts");
    expect(branch).toContain("pedidos_mesa, mostrador_qr_pago_previo, cantidad_mesas");
    expect(branch).toContain("mostrador_qr_pago_previo: v.data.mostradorQrPagoPrevio,");
    expect(read("src/lib/db/schema.ts")).toContain('boolean("mostrador_qr_pago_previo").notNull().default(false)');
    const page = read("src/app/(app)/panel/config/page.tsx");
    expect(page).toContain('editar("mostradorQrPagoPrevio", !mostradorQrPagoPrevio)');
    expect(page).toContain("mostradorQrPagoPrevio !== c.mostradorQrPagoPrevio ||");
  });

  it("el texto para el dueño dice qué hace", () => {
    expect(translate("es", "retiroConfig.pagoPrevio")).toBe("Requerir pago antes de preparar el pedido");
    expect(translate("es", "retiroConfig.pagoPrevioDet")).toContain("deben pagarse primero");
  });
});

describe("panel: la misma bandeja y el mismo aviso que Mesa", () => {
  it("el cobro de un pedido del mostrador no se nombra como mesa", () => {
    const [mesa, mostrador] = cajaAlerts([
      { id: "a", reference: "7", tableNumber: 3, payAtCounterAt: "2026-10-03T12:00:00Z" },
      { id: "b", reference: "8", tableNumber: null, payAtCounterAt: "2026-10-03T12:01:00Z" },
    ]);
    expect(mesa!.kind).toBe("cobro-caja");
    expect(mostrador!.kind).toBe("cobro-caja-mostrador");
    expect(mostrador!.label).toBe("8");
    expect(ALERT_META["cobro-caja-mostrador"].priority).toBe(ALERT_META["cobro-caja"].priority);
    expect(translate("es", ALERT_META["cobro-caja-mostrador"].titleKey, { n: "8" })).toBe(
      "Pedido 8 viene a pagar a la caja",
    );
  });

  it("Por cobrar y su aviso valen también en Mostrador QR, sin una bandeja nueva", () => {
    const page = read("src/app/(app)/panel/pedidos/page.tsx");
    expect(page.match(/<PickupChargeInbox/g)).toHaveLength(1);
    const alertas = read("src/lib/hooks/usePanelAlerts.ts");
    /* El aviso global, que corre en todo el panel, solo con la opción prendida. */
    expect(alertas).toContain("const conCobros = pedidosEnMesa || (pedidosMostradorQr && pagoPrevio);");
    expect(alertas).toContain("useConfigStore((s) => s.mostradorQrPagoPrevio)");
    const inbox = read("src/components/panel/pedidos/PickupChargeInbox.tsx");
    expect(inbox).toContain('t("retiroCaja.pedidoMostrador")');
    expect(inbox).not.toContain('n: o.tableNumber ?? "—"');
  });

  it("el aviso de pedido nuevo sigue siendo solo de lo que está en creado", () => {
    expect(read("src/lib/data/orders.ts")).toContain('.eq("estado", "creado")');
  });
});

describe("cliente", () => {
  const pedido = (id: string, status: OrderStatus): PickupOrder =>
    ({ id, status }) as PickupOrder;

  it("newlyConfirmed: solo lo que esperaba el pago y entró al local, visto en vivo", () => {
    const antes = new Map<string, OrderStatus>([
      ["a", "pendiente_pago"],
      ["b", "pendiente_pago"],
      ["c", "creado"],
      ["d", "pendiente_pago"],
    ]);
    const ahora = [
      pedido("a", "creado"),
      pedido("b", "cancelado"),
      pedido("c", "en_preparacion"),
      pedido("d", "pendiente_pago"),
      pedido("e", "creado"),
    ];
    expect(newlyConfirmed(antes, ahora)).toEqual(["a"]);
  });

  it("la tarjeta del mostrador dice que todavía no se confirmó y deja cancelar solo entonces", () => {
    const card = read("src/components/customer/table/PickupOrderCard.tsx");
    expect(card).toContain('const esperaPago = order.status === "pendiente_pago";');
    expect(card).toContain('t("mostradorQr.pagoPrevio.estado")');
    expect(card).toContain("{esperaPago && (\n        <button");
    expect(card).toContain("onCancel={onCancel}");
    expect(translate("es", "mostradorQr.pagoPrevio.pendienteCuerpo")).toBe(
      "Tu pedido todavía no fue confirmado. Completá el pago para enviarlo al local.",
    );
    expect(translate("es", "mostradorQr.pagoPrevio.confirmadoCuerpo")).toBe(
      "Tu pago fue confirmado y tu pedido ya fue enviado al local.",
    );
  });

  it("la pantalla lee la opción en el servidor, solo para los textos", () => {
    expect(read("src/lib/server/tablePickup.ts")).toContain('.select("mostrador_qr_pago_previo")');
    const page = read("src/app/(customer)/m/[token]/page.tsx");
    expect(page).toContain('qr.flow === "mostrador_qr" ? fetchCounterPayFirst(qr.branchId)');
    /* El pedido sigue viajando igual: el estado lo decide la base. */
    expect(read("src/app/api/m/[token]/autoservicio/pedidos/route.ts")).not.toContain("payFirst");
  });
});

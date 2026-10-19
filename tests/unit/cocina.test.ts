import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { kitchenLanes, nextKitchenStatus, parseCocinaModo, type KitchenTicket } from "@/lib/kitchen";
import { alertIsElsewhere, cocinaListaAlerts } from "@/lib/panelAlerts";

const ticket = (id: string, status: KitchenTicket["status"], createdAt: string): KitchenTicket => ({
  id,
  reference: id,
  alias: null,
  status,
  createdAt,
  readyAt: null,
  tableNumber: null,
  items: [],
});

describe("cocina", () => {
  it("imprimir es el default", () => {
    expect(parseCocinaModo(undefined)).toBe("imprimir");
    expect(parseCocinaModo("pantalla")).toBe("pantalla");
    expect(parseCocinaModo("otro")).toBe("imprimir");
  });

  it("parte las comandas en tres pilas, la más vieja primero", () => {
    const lanes = kitchenLanes([
      ticket("b", "creado", "2026-10-19T12:02:00Z"),
      ticket("a", "creado", "2026-10-19T12:00:00Z"),
      ticket("c", "en_preparacion", "2026-10-19T12:01:00Z"),
      ticket("d", "listo", "2026-10-19T12:03:00Z"),
    ]);
    expect(lanes.nueva.map((t) => t.id)).toEqual(["a", "b"]);
    expect(lanes.preparando.map((t) => t.id)).toEqual(["c"]);
    expect(lanes.lista.map((t) => t.id)).toEqual(["d"]);
    expect(nextKitchenStatus("nueva")).toBe("en_preparacion");
    expect(nextKitchenStatus("preparando")).toBe("listo");
  });

  it("lista avisa al mostrador y no se duplica en Pedidos ni en Cocina", () => {
    const [alerta] = cocinaListaAlerts([
      { id: "1", reference: "42", readyAt: "2026-10-19T12:00:00Z", tableNumber: 4 },
    ]);
    expect(alerta?.kind).toBe("cocina-lista");
    expect(alerta?.label).toBe("Mesa 4");
    expect(alertIsElsewhere(alerta!, "/panel/pagos")).toBe(true);
    expect(alertIsElsewhere(alerta!, "/panel/pedidos")).toBe(false);
    expect(alertIsElsewhere(alerta!, "/panel/cocina")).toBe(false);
  });

  it("la pantalla no deja que el minuto pase la comanda a preparando sola", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/cocina-modo.sql"), "utf8");
    expect(sql).toContain("cocina_modo = 'pantalla'");
    expect(sql).toContain("sesion_id is null");
    expect(sql).toContain("return 0");
    const orden = JSON.parse(
      readFileSync(join(process.cwd(), "supabase/orden.json"), "utf8"),
    ) as string[];
    expect(orden.at(-1)).toBe("cocina-modo.sql");
  });
});

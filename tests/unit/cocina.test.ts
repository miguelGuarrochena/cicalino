import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { kitchenLanes, parseCocinaModo, type KitchenTicket } from "@/lib/kitchen";
import { alertIsElsewhere, cocinaListaAlerts } from "@/lib/panelAlerts";

const ticket = (
  id: string,
  createdAt: string,
  doneAt: string | null = null,
): KitchenTicket => ({
  id,
  reference: id,
  alias: null,
  status: "en_preparacion",
  createdAt,
  readyAt: null,
  doneAt,
  tableNumber: null,
  items: [],
});

describe("cocina", () => {
  it("imprimir es el default", () => {
    expect(parseCocinaModo(undefined)).toBe("imprimir");
    expect(parseCocinaModo("pantalla")).toBe("pantalla");
    expect(parseCocinaModo("otro")).toBe("imprimir");
  });

  it("separa lo que se cocina de lo que ya está hecho, la más vieja primero", () => {
    const lanes = kitchenLanes([
      ticket("b", "2026-10-19T12:02:00Z"),
      ticket("a", "2026-10-19T12:00:00Z"),
      ticket("c", "2026-10-19T12:01:00Z", "2026-10-19T12:20:00Z"),
    ]);
    expect(lanes.preparando.map((t) => t.id)).toEqual(["a", "b"]);
    expect(lanes.hecha.map((t) => t.id)).toEqual(["c"]);
  });

  it("hecha avisa al mostrador y no se duplica donde ya se marca listo", () => {
    const [mostrador] = cocinaListaAlerts([
      { id: "1", reference: "42", readyAt: "2026-10-19T12:00:00Z", tableNumber: null, where: "pedidos" },
    ]);
    expect(mostrador?.kind).toBe("cocina-lista");
    expect(mostrador?.href).toBe("/panel/pedidos");
    expect(mostrador?.label).toBe("Pedido 42");
    expect(alertIsElsewhere(mostrador!, "/panel/pagos")).toBe(true);
    expect(alertIsElsewhere(mostrador!, "/panel/pedidos")).toBe(false);
    expect(alertIsElsewhere(mostrador!, "/panel/cocina")).toBe(false);

    const [mesa] = cocinaListaAlerts([
      { id: "2", reference: "7", readyAt: "2026-10-19T12:00:00Z", tableNumber: 4, where: "pagos" },
    ]);
    expect(mesa?.href).toBe("/panel/pagos");
    expect(mesa?.label).toBe("Mesa 4");
    expect(alertIsElsewhere(mesa!, "/panel/pagos")).toBe(false);
    expect(alertIsElsewhere(mesa!, "/panel/pedidos")).toBe(true);
  });

  it("la pantalla no cocina sola y hecha no cambia el estado", () => {
    const modo = readFileSync(join(process.cwd(), "supabase/cocina-modo.sql"), "utf8");
    expect(modo).toContain("cocina_modo = 'pantalla'");
    expect(modo).toContain("return 0");
    const pase = readFileSync(join(process.cwd(), "supabase/cocina-pase.sql"), "utf8");
    expect(pase).toContain("cocina_hecha_en");
    expect(pase).toContain("p.cocina_hecha_en");
    const cocina = readFileSync(
      join(process.cwd(), "src/app/(app)/panel/cocina/page.tsx"),
      "utf8",
    );
    expect(cocina).not.toContain("notifyCustomer");
    const orden = JSON.parse(
      readFileSync(join(process.cwd(), "supabase/orden.json"), "utf8"),
    ) as string[];
    expect(orden.indexOf("cocina-modo.sql")).toBeLessThan(orden.indexOf("plato-aclaracion.sql"));
    expect(orden.at(-1)).toBe("cocina-pase.sql");
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(
  join(root, "supabase/pedidos-pagina-jornada.sql"),
  "utf8",
);
const orders = readFileSync(join(root, "src/lib/data/orders.ts"), "utf8");
const hook = readFileSync(join(root, "src/lib/hooks/useOrders.ts"), "utf8");
const card = readFileSync(
  join(root, "src/components/panel/OrderCard.tsx"),
  "utf8",
);
const panel = readFileSync(
  join(root, "src/app/(app)/panel/page.tsx"),
  "utf8",
);
const waitlist = readFileSync(join(root, "src/lib/data/waitlist.ts"), "utf8");
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);

describe("Medium — jornada de pedidos_pagina + panel de estados", () => {
  it("pedidos_pagina ignora p_desde y usa hora_corte", () => {
    expect(sql).toMatch(/p_desde se ignora a propósito/);
    expect(sql).toContain("locales.hora_corte");
    expect(sql).toContain("America/Argentina/Buenos_Aires");
    expect(sql).toContain("creado_en >= v_desde");
    expect(sql).not.toMatch(/creado_en >= p_desde/);
  });

  it("el CAS de pedidos usa orígenes, no el snapshot de la UI", () => {
    expect(orders).toContain("orderTransitionSources");
    expect(orders).toMatch(/\.in\("estado", desde\)/);
    expect(hook).toContain("await updateOrderStatus(id, status)");
    expect(hook).toContain("await reload()");
    expect(hook).not.toMatch(/updateOrderStatus\(id, status, desde\)/);
  });

  it("si el cambio falla no festeja listo y avisa", () => {
    expect(panel).toContain("if (!res.ok)");
    expect(panel).toContain("No se pudo actualizar el pedido");
    expect(card).toContain("const [busy, setBusy]");
    expect(card).toContain("disabled={busy}");
  });

  it("mutaciones de pedido y espera van a reportError", () => {
    expect(orders).toContain('reportError("panel.pedidos.crear"');
    expect(orders).toContain('reportError("panel.pedidos.estado"');
    expect(waitlist).toContain('reportError("panel.espera.insertar"');
    expect(waitlist).toContain('reportError("panel.espera.sentar"');
    expect(waitlist).toContain('reportError("panel.espera.estado"');
  });

  it("chequeo-migraciones registra pedidos-pagina-jornada", () => {
    expect(chequeo).toContain(
      "('pedidos-pagina-jornada.sql', 'function', 'pedidos_pagina', 55)",
    );
    expect(chequeo).toContain(
      "('pedidos-pagina-jornada.sql', 'pedidos-paginado.sql, security-fixes-15.sql')",
    );
  });
});

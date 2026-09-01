import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: vi.fn(),
}));

import { createBrowserSupabase } from "@/lib/supabase/client";
import { fetchOrdersPage } from "@/lib/data/orders";

const root = process.cwd();
const sql = readFileSync(
  join(root, "supabase/pedidos-avisos-activos.sql"),
  "utf8",
);
const orden = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
) as string[];

describe("pedidos_pagina — avisos_activos", () => {
  it("lo resuelve con un exists sobre push_subscriptions", () => {
    expect(sql).toMatch(
      /'avisos_activos', exists \([\s\S]*?from public\.push_subscriptions ps[\s\S]*?where ps\.pedido_id = p\.id/,
    );
  });

  it("no saca de la base el endpoint ni las claves del navegador", () => {
    /* push_subscriptions tiene RLS y guarda material de cifrado. Del listado
     * sale un booleano y nada más. */
    expect(sql).not.toContain("ps.endpoint");
    expect(sql).not.toContain("ps.p256dh");
    expect(sql).not.toContain("ps.auth");
  });

  it("el exists va sobre la página, no sobre la jornada", () => {
    const items = sql.slice(sql.indexOf("'items'"), sql.indexOf("'total'"));
    expect(items).toContain("from pagina p");
    expect(items).toContain("avisos_activos");
  });

  it("no pierde lo que ya hacía pedidos_pagina", () => {
    // El buscador por alias solo matchea pedidos abiertos (alias-busca-activos).
    expect(sql).toContain(
      "and estado in ('creado', 'en_preparacion', 'listo')",
    );
    // Y los contadores siguen juntando creado con en_preparacion.
    expect(sql).toMatch(
      /count\(\*\) filter \(where estado in \('creado', 'en_preparacion'\)\)\s+as creado/,
    );
    expect(sql).toContain("'proximoNumero'");
  });

  it("fija el índice del que depende el exists", () => {
    expect(sql).toMatch(
      /create index if not exists idx_push_pedido\s+on public\.push_subscriptions \(pedido_id\)/,
    );
  });

  it("corre después de la última versión previa de pedidos_pagina", () => {
    expect(orden).toContain("pedidos-avisos-activos.sql");
    expect(
      orden.indexOf("pedidos-avisos-activos.sql"),
    ).toBeGreaterThan(orden.indexOf("alias-busca-activos.sql"));
  });
});

describe("fetchOrdersPage → OrderView.hasPush", () => {
  const createBrowserMock = vi.mocked(createBrowserSupabase);

  const supabaseCon = (items: unknown[]) =>
    ({
      rpc: () =>
        Promise.resolve({
          data: {
            items,
            total: items.length,
            conteos: {
              todos: items.length,
              creado: items.length,
              listo: 0,
              retirado: 0,
              cancelado: 0,
            },
            proximoNumero: 2,
          },
          error: null,
        }),
    }) as unknown as ReturnType<typeof createBrowserSupabase>;

  const fila = (over: Record<string, unknown>) => ({
    id: "11111111-1111-1111-1111-111111111111",
    referencia: "1",
    alias_cliente: null,
    estado: "creado",
    creado_en: "2026-09-01T12:00:00Z",
    en_preparacion_en: null,
    listo_en: null,
    retirado_en: null,
    cancelado_en: null,
    visto_en: null,
    qr_token: "22222222-2222-2222-2222-222222222222",
    empleado_nombre: null,
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("traduce avisos_activos a hasPush", async () => {
    createBrowserMock.mockReturnValue(
      supabaseCon([
        fila({ avisos_activos: true }),
        fila({ id: "33333333-3333-3333-3333-333333333333", avisos_activos: false }),
      ]),
    );

    const res = await fetchOrdersPage("local-1", {
      filtro: "todos",
      busqueda: "",
      pagina: 1,
      tam: 9,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.items.map((o) => o.hasPush)).toEqual([true, false]);
  });

  it("una base sin la migración todavía no rompe: hasPush queda en false", async () => {
    /* Mientras pedidos-avisos-activos.sql no esté aplicado, la RPC vieja no
     * manda el campo. La tarjeta tiene que caer en "sin avisos", no romperse
     * ni mostrar un chip vacío. */
    const sinCampo = fila({});
    expect(sinCampo).not.toHaveProperty("avisos_activos");
    createBrowserMock.mockReturnValue(supabaseCon([sinCampo]));

    const res = await fetchOrdersPage("local-1", {
      filtro: "todos",
      busqueda: "",
      pagina: 1,
      tam: 9,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.items[0].hasPush).toBe(false);
  });

  it("sin visto_en el pedido no puede tener aviso propio", async () => {
    createBrowserMock.mockReturnValue(
      supabaseCon([fila({ visto_en: null, avisos_activos: false })]),
    );

    const res = await fetchOrdersPage("local-1", {
      filtro: "todos",
      busqueda: "",
      pagina: 1,
      tam: 9,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.items[0].seenAt).toBeNull();
    expect(res.data.items[0].hasPush).toBe(false);
  });
});

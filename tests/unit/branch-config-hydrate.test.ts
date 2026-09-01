import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: vi.fn(),
}));

import { createBrowserSupabase } from "@/lib/supabase/client";
import { fetchBranchConfig } from "@/lib/data/branch";
import { useConfigStore } from "@/lib/store/config-store";

const createBrowserMock = vi.mocked(createBrowserSupabase);

/* La fila tal cual la devuelve `locales`.
 *
 * Ningún valor coincide con los que el store trae de fábrica —ni los del modo
 * demo ni los vacíos del modo live—: si coincidieran, el test pasaría sin que
 * la hidratación hiciera nada. */
const fila = {
  nombre: "Panadería Rivadavia",
  tipo_negocio: "cafeteria",
  whatsapp: "+54 9 11 4444 0000",
  direccion: "Rivadavia 1200",
  modo_identificacion: "mesa",
  cantidad_mesas: 12,
  hora_corte: 9,
  reserva_abre_min: 720,
  reserva_cierra_min: 1320,
  dias_cerrados: [1],
  modulo_pedidos: true,
  modulo_espera: true,
};

const supabaseCon = (data: unknown) =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data, error: null }),
        }),
      }),
    }),
  }) as unknown as ReturnType<typeof createBrowserSupabase>;

beforeEach(() => {
  vi.clearAllMocks();
});

/* El nombre del local viajaba como `nombre`, que es la columna, y hydrate
 * espera las claves del store. Como el objeto no es un literal, TypeScript no
 * lo marcaba: se guardaba una clave suelta y `name` quedaba en "" para
 * siempre, así que Configuración mostraba "—" donde va el nombre. */
describe("fetchBranchConfig → hydrate", () => {
  it("devuelve el nombre bajo la clave que usa el store", async () => {
    createBrowserMock.mockReturnValue(supabaseCon(fila));

    const cfg = await fetchBranchConfig("local-1");

    expect(cfg?.name).toBe("Panadería Rivadavia");
    expect(cfg).not.toHaveProperty("nombre");
  });

  it("hidratado, Configuración tiene el nombre para mostrar", async () => {
    createBrowserMock.mockReturnValue(supabaseCon(fila));

    const cfg = await fetchBranchConfig("local-1");
    useConfigStore.getState().hydrate(cfg!);

    const s = useConfigStore.getState();
    expect(s.name).toBe("Panadería Rivadavia");
    /* El resto del mapeo, para que el renombre no se lleve nada puesto. */
    expect(s.tipo).toBe("cafeteria");
    expect(s.modo).toBe("mesa");
    expect(s.tableCount).toBe(12);
    expect(s.diasCerrados).toEqual([1]);
    expect(s.cutoffHour).toBe(9);
    expect(s.branchConfigReady).toBe(true);
  });

  it("sin nombre en la fila queda vacío, no undefined", async () => {
    createBrowserMock.mockReturnValue(supabaseCon({ ...fila, nombre: null }));

    const cfg = await fetchBranchConfig("local-1");

    expect(cfg?.name).toBe("");
  });
});

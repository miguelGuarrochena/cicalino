import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: vi.fn(),
}));

import { createBrowserSupabase } from "@/lib/supabase/client";
import { releaseTables } from "@/lib/data/waitlist";

const root = process.cwd();
const sql = readFileSync(
  join(root, "supabase/liberar-mesas-atomico.sql"),
  "utf8",
);
const hook = readFileSync(join(root, "src/lib/hooks/useWaitlist.ts"), "utf8");
const orden = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
) as string[];

describe("liberar_mesas — la unión se libera entera o no se libera", () => {
  it("es un solo UPDATE, no uno por mesa", () => {
    const cuerpo = sql.slice(sql.indexOf("create or replace function"));
    expect(cuerpo.match(/update public\.mesas/g)).toHaveLength(1);
  });

  it("arma el grupo en la base, con lo que la base tiene en ese momento", () => {
    expect(sql).toMatch(/with objetivo as \([\s\S]*?from public\.mesas/);
    expect(sql).toContain("m.espera_id  = o.espera_id");
    expect(sql).toContain("m.reserva_id = o.reserva_id");
  });

  it("solo arrastra mesas que sigan ocupadas por ese mismo grupo", () => {
    /* Lo que hace que una segunda llamada concurrente sea un no-op en vez de
     * liberar mesas que otro ya volvió a ocupar. */
    expect(sql).toContain("o.estado = 'ocupada'");
    expect(sql).toContain("m.estado = 'ocupada'");
  });

  it("p_solo_esta corta el arrastre", () => {
    expect(sql).toContain("not coalesce(p_solo_esta, false)");
  });

  it("deja la mesa realmente libre: sin espera ni reserva colgando", () => {
    expect(sql).toMatch(/set estado = 'libre',\s*espera_id = null,\s*reserva_id = null/);
  });

  it("sella el historial con la columna que ya existe", () => {
    /* actualizado_en ya estaba en el modelo; no se agrega ninguna columna. */
    expect(sql).toContain("actualizado_en = now()");
    expect(sql).not.toMatch(/alter table public\.mesas\s+add column/i);
  });

  it("chequea acceso y no queda abierta a anon", () => {
    expect(sql).toContain("puede_ver_local(p_local)");
    expect(sql).toMatch(
      /revoke all on function public\.liberar_mesas\(uuid, integer, boolean\)\s*\n?\s*from public, anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.liberar_mesas\(uuid, integer, boolean\)\s*\n?\s*to authenticated/i,
    );
  });

  it("está registrada después de lo que necesita", () => {
    expect(orden).toContain("liberar-mesas-atomico.sql");
    for (const dep of [
      "modulo-espera.sql",
      "reservas-mesa.sql",
      "security-fixes-04.sql",
    ]) {
      expect(
        orden.indexOf("liberar-mesas-atomico.sql"),
        `después de ${dep}`,
      ).toBeGreaterThan(orden.indexOf(dep));
    }
  });
});

describe("useWaitlist ya no libera mesa por mesa", () => {
  it("el bucle de setTableState desapareció del hook", () => {
    const liberar = hook.slice(
      hook.indexOf("const liberarMesa"),
      hook.indexOf("const setCapacidad"),
    );
    expect(liberar).toContain("releaseTables");
    expect(liberar).not.toContain("setTableState");
    expect(liberar).not.toMatch(/for \(const m of mismas\)/);
  });
});

describe("releaseTables", () => {
  const mock = vi.mocked(createBrowserSupabase);
  const rpc = vi.fn();

  const supabaseCon = (error: { message: string } | null) => {
    rpc.mockResolvedValue({ data: 3, error });
    return { rpc } as unknown as ReturnType<typeof createBrowserSupabase>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("manda una sola llamada con los tres parámetros", async () => {
    mock.mockReturnValue(supabaseCon(null));

    const ok = await releaseTables("local-1", 4);

    expect(ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("liberar_mesas", {
      p_local: "local-1",
      p_numero: 4,
      p_solo_esta: false,
    });
  });

  it("propaga soloEsta", async () => {
    mock.mockReturnValue(supabaseCon(null));
    await releaseTables("local-1", 4, { soloEsta: true });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_solo_esta: true });
  });

  it("si la RPC falla devuelve false y no rompe la pantalla", async () => {
    mock.mockReturnValue(supabaseCon({ message: "boom" }));
    expect(await releaseTables("local-1", 4)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const src = readFileSync(join(root, "src/lib/hooks/useOrders.ts"), "utf8");

/* El canal de realtime escucha la tabla `pedidos` de la sucursal. Eso no
 * cambia porque el mozo pase de página, filtre o escriba en el buscador — pero
 * el efecto que lo montaba compartía dependencias con la consulta, así que
 * cada una de esas cosas lo desarmaba y lo volvía a armar. */
describe("Pedidos: la suscripción no depende del filtro", () => {
  const efecto = (marca: string): string => {
    const desde = src.indexOf(marca);
    expect(desde, `no encontré ${marca}`).toBeGreaterThan(-1);
    const cierre = src.indexOf("  }, [", desde);
    return src.slice(desde, src.indexOf("]);", cierre) + 3);
  };

  it("el efecto del canal vive con la sucursal, no con la consulta", () => {
    const bloque = efecto("attachLiveRefresh({");
    expect(bloque).toContain("}, [live, branchId, seed]);");
    for (const param of ["filtro", "busqueda", "pagina", "tam"]) {
      expect(bloque, param).not.toContain(param);
    }
  });

  it("el canal llama al reload de ahora, no al que había al conectarse", () => {
    expect(src).toContain("reloadRef.current = reload;");
    expect(src).toContain("reload: () => void reloadRef.current(),");
  });

  it("cambiar de filtro sigue disparando una consulta nueva", () => {
    expect(src).toContain("void reload();\n  }, [reload]);");
  });

  it("una respuesta vieja no pisa la pantalla del filtro nuevo", () => {
    /* Dos consultas pueden estar en el aire a la vez: la del filtro que el
     * mozo dejó y la del que eligió. Si vuelve segunda la vieja, se descarta
     * en vez de pintar la lista equivocada. */
    expect(src).toContain("const miConsulta = ++consulta.current;");
    expect(src).toContain("if (miConsulta !== consulta.current) return;");
    /* La guarda va antes de tocar el estado. */
    const cuerpo = src.slice(src.indexOf("const miConsulta"));
    expect(cuerpo.indexOf("if (miConsulta !== consulta.current) return;"))
      .toBeLessThan(cuerpo.indexOf("setLiveOrders("));
  });

  it("nada de esto tocó coalesced ni el respaldo del poll", () => {
    expect(src).toContain("coalesced(recargar)");
    expect(src).toContain("ticksSano: 6");
  });
});

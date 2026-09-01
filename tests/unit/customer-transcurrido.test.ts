import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { translate } from "@/lib/i18n";

const root = process.cwd();
const ruta = readFileSync(
  join(root, "src/app/api/p/[token]/route.ts"),
  "utf8",
);
const loader = readFileSync(
  join(root, "src/lib/data/customer-order.ts"),
  "utf8",
);
const pantalla = readFileSync(
  join(root, "src/components/customer/CustomerWaiting.tsx"),
  "utf8",
);

/* El cliente que espera un pedido no tenía ninguna noción de tiempo: veía una
 * campana y "estamos preparando tu pedido", sin nada más. Ahora ve cuánto
 * lleva esperando — y solo eso: no hay estimación de cuánto falta. */
describe("Tiempo transcurrido en la pantalla del cliente", () => {
  it("el dato viaja por los dos caminos: render inicial y poll", () => {
    /* Si alguien saca `creado_en` de cualquiera de los dos selects, la línea
     * desaparece sin que falle nada. Por eso se fija acá. */
    expect(loader).toMatch(/select\([\s\S]*?creado_en[\s\S]*?locales\(nombre/);
    expect(loader).toContain("createdAt: data.creado_en");

    expect(ruta).toMatch(/select\([\s\S]*?creado_en[\s\S]*?locales\(nombre/);
    expect(ruta).toContain("createdAt: data.creado_en");
  });

  it("es una columna de pedidos: no agrega joins al poll", () => {
    const select = ruta.slice(ruta.indexOf(".select("), ruta.indexOf(".eq("));
    const joins = select.match(/\w+\(/g) ?? [];
    // El único embed sigue siendo locales(...), como antes del cambio.
    expect(joins.filter((j) => j !== "select(")).toEqual(["locales("]);
  });

  it("la copia dice lo que pasó, no lo que falta", () => {
    const es = translate("es", "cliente.transcurrido", { n: 6 });
    const en = translate("en", "cliente.transcurrido", { n: 6 });

    expect(es).toBe("Llevás 6 min esperando");
    expect(en).toBe("You've been waiting 6 min");

    for (const copia of [es, en]) {
      expect(copia).not.toMatch(/falta|queda|estimad|remaining|left|about|~/i);
    }
  });

  it("no se muestra durante el primer minuto ni con el pedido cerrado", () => {
    expect(pantalla).toContain("minutosEsperando >= 1");
    expect(pantalla).toMatch(/order\?\.createdAt && !cerrado/);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* La legibilidad del comensal, fijada como regla.
 *
 * El flujo del cliente tenía 32 textos de 12 px o menos, los `+`/`−` medían
 * 36 px y media docena de colores salían de la paleta cruda de Tailwind con un
 * `dark:` al lado que nunca se aplicaba — el comensal fuerza `data-theme`
 * claro, así que sobre un local de fondo oscuro quedaban recuadros claros y
 * texto rojo ilegible.
 *
 * Esto no mide contraste: eso lo hace `customer-contraste`. Mide que nadie
 * vuelva a meter en estas pantallas un tamaño ni un color que se salga del
 * sistema, que es por donde se rompe de a poco. */

const DIR = "src/components/customer";

const archivos = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? archivos(join(dir, e.name))
      : e.name.endsWith(".tsx")
        ? [join(dir, e.name)]
        : [],
  );

/* El texto de los comentarios explica justamente lo que se prohíbe, así que
 * se saca antes de buscar. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const FUENTES = [...archivos(DIR), "src/components/tables/BillParts.tsx"].map((f) => ({
  f,
  src: sinComentarios(readFileSync(f, "utf8")),
}));

describe("legibilidad del comensal", () => {
  it("no queda texto por debajo de 14px", () => {
    /* `text-xs` es 12 px y `text-[11px]` es peor. Nada de lo que el comensal
     * tiene que leer baja de `text-sm`. */
    const malos = FUENTES.filter(
      ({ src }) => /\btext-xs\b/.test(src) || /text-\[1[0-3]px\]/.test(src),
    ).map(({ f }) => f);
    expect(malos).toEqual([]);
  });

  it("no hay colores crudos de la paleta de Tailwind", () => {
    /* `bg-red-50`, `text-emerald-800`, `border-amber-300`: no siguen el fondo
     * que eligió el local. Los tonos van por `--ok`, `--curso` y `--alerta`,
     * que `[data-scheme="dark"]` ya ajusta. */
    const malos = FUENTES.filter(({ src }) =>
      /\b(text|bg|border|ring)-(red|emerald|amber|rose|green|orange|yellow|slate|gray|zinc|neutral)-\d{2,3}\b/.test(
        src,
      ),
    ).map(({ f }) => f);
    expect(malos).toEqual([]);
  });

  it("no queda ningún `dark:`, que en el comensal es código muerto", () => {
    /* El variante está atado a `data-theme`, y `(customer)/layout` lo fuerza
     * en claro. Todo `dark:` de estas pantallas era una regla que no corría. */
    const malos = FUENTES.filter(({ src }) => /\bdark:/.test(src)).map(({ f }) => f);
    expect(malos).toEqual([]);
  });

  it("el texto secundario usa el token y no una opacidad inventada", () => {
    /* `text-carbon/55`, `/50`, `/45`, `/35`: seis grises distintos y ninguno
     * llegaba a AA. Ahora hay un solo nivel, `text-suave`. */
    const malos = FUENTES.filter(({ src }) => /text-carbon\/\d+/.test(src)).map(({ f }) => f);
    expect(malos).toEqual([]);
  });

  it("los controles del comensal llegan a 44px", () => {
    /* `size-9` son 36 px y `min-h-10` son 40: abajo de los 44 que pide tanto
     * Apple como el criterio 2.5.8 de la WCAG en su nivel cómodo. Los `+`/`−`
     * de la carta, que son el control más usado de todo el producto, estaban
     * entre los chicos.
     *
     * Solo cuenta lo que se toca. Un chip de estado o un spinner pueden medir
     * 32 px sin que eso sea un problema: nadie les apunta con el dedo. */
    const chicos: string[] = [];
    for (const { f, src } of FUENTES) {
      for (const trozo of src.split(/<(?:button|input|select|textarea)\b/).slice(1)) {
        const cls = /className=[{`"]([^"`]*)/.exec(trozo.slice(0, 700))?.[1] ?? "";
        if (/\b(size-(?:[5-9]|10)|min-h-(?:[5-9]|10))\b/.test(cls)) {
          chicos.push(`${f}: ${cls.slice(0, 60)}`);
        }
      }
    }
    expect(chicos).toEqual([]);
  });

  it("la carta no deja hueco cuando el plato no tiene foto", () => {
    /* La tarjeta salió de la pantalla a su propio archivo cuando la búsqueda
     * pasó a dibujarla también. La regla no cambió: sin `imageUrl` la rama
     * falsa es `null` —ni caja gris ni foto genérica— y el texto se queda con
     * el ancho entero. */
    const tarjeta = FUENTES.find(({ f }) => f.endsWith("MenuItemCard.tsx"))!.src;
    const i = tarjeta.indexOf("producto.imageUrl ? (");
    expect(i).toBeGreaterThan(-1);
    expect(tarjeta.slice(i, i + 400)).toContain(") : null}");
  });
});

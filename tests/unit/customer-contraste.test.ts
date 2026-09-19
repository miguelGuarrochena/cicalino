import { describe, it, expect } from "vitest";
import { BRAND_PRESETS, BRAND_COLOR_IDS } from "@/lib/customerBrand";

/* El contraste del comensal, como regla y no como criterio.
 *
 * La pantalla del cliente la pinta el local: elige un color y ese color pasa a
 * ser el fondo de todo. Hasta acá nadie medía qué pasaba después. El resultado
 * fue que con `verde` el nombre del plato quedaba en 3.83:1 y con `terracota`
 * en 4.11 — abajo de AA el texto PRINCIPAL, no el secundario. Y en la pantalla
 * de espera, el número de turno daba 1.09:1: el mismo color que el fondo.
 *
 * Estas cuentas son las de la WCAG 2.1, y están acá para que sumar un preset
 * nuevo tenga que pasar por ellas. */

const canal = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const luminancia = (hex: string) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => canal(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/* Mezcla `fg` sobre `bg`, igual que `color-mix(in srgb, fg N%, bg)`. */
const mezcla = (fg: string, bg: string, n: number) => {
  const [f, b] = [fg.replace("#", ""), bg.replace("#", "")];
  const canal2 = (i: number) =>
    Math.round(
      (n * parseInt(f.slice(i, i + 2), 16) + (1 - n) * parseInt(b.slice(i, i + 2), 16)),
    );
  return "#" + [0, 2, 4].map((i) => canal2(i).toString(16).padStart(2, "0")).join("");
};

const AA = 4.5;
/* Texto grande (>= 24px o >= 18.66px en negrita): la WCAG pide 3:1. El número
 * de turno de `/e/` y el de mesa de `/m/` entran acá — son de 60px para arriba. */
const AA_GRANDE = 3;

describe("contraste del comensal", () => {
  it.each(BRAND_COLOR_IDS)("%s: el texto principal se lee sobre la tarjeta", (id) => {
    const p = BRAND_PRESETS[id];
    /* Las tarjetas —nombre del plato, precio, consumo— viven sobre `surface`,
     * no sobre el fondo. Ahí es donde hay que medir. */
    expect(contraste(p.text, p.surface)).toBeGreaterThanOrEqual(AA);
    expect(contraste(p.text, p.bg)).toBeGreaterThanOrEqual(AA);
  });

  it.each(BRAND_COLOR_IDS)("%s: el texto secundario también cumple AA", (id) => {
    const p = BRAND_PRESETS[id];
    expect(contraste(p.soft, p.surface)).toBeGreaterThanOrEqual(AA);
    expect(contraste(p.soft, p.bg)).toBeGreaterThanOrEqual(AA);
  });

  it.each(BRAND_COLOR_IDS)("%s: `soft` es de verdad la mezcla al 74%%", (id) => {
    const p = BRAND_PRESETS[id];
    /* Si alguien toca `text` o `surface` sin recalcular `soft`, la garantía de
     * arriba podría seguir dando por casualidad con un gris que ya no pertenece
     * a la paleta. Esto ata el valor a su origen. */
    expect(p.soft.toLowerCase()).toBe(mezcla(p.text, p.surface, 0.74));
  });

  it.each(BRAND_COLOR_IDS)("%s: el secundario se distingue del principal", (id) => {
    const p = BRAND_PRESETS[id];
    /* La jerarquía tiene que seguir viéndose: si `soft` quedara igual que
     * `text`, cumpliría AA y no diría nada. */
    expect(p.soft.toLowerCase()).not.toBe(p.text.toLowerCase());
    expect(contraste(p.text, p.surface)).toBeGreaterThan(contraste(p.soft, p.surface));
  });

  it.each(BRAND_COLOR_IDS)("%s: el número grande de marca se ve sobre el fondo", (id) => {
    const p = BRAND_PRESETS[id];
    /* `Mesa 7` en `/m/`, el turno en `/e/` y la referencia en `/p/` se pintan
     * con `--brand` sobre `--bg`. Con `--espera` atado a la marca, esta misma
     * cuenta cubre las tres pantallas. */
    expect(contraste(p.brand, p.bg)).toBeGreaterThanOrEqual(AA_GRANDE);
  });

  it("la marca y el fondo no pueden ser el mismo color", () => {
    for (const id of BRAND_COLOR_IDS) {
      const p = BRAND_PRESETS[id];
      expect(p.brand.toLowerCase()).not.toBe(p.bg.toLowerCase());
    }
  });

  it("el default de Cicalino cumple lo mismo que los presets", () => {
    /* Sin color elegido no hay preset: mandan las variables de `globals.css`.
     * Los valores van acá para que el default no quede fuera de la regla. */
    const crema = "#f4f1da";
    const surface = "#fbf9ec";
    const carbon = "#20264f";
    const suave = "#595d78";
    const teal = "#0f766e";

    expect(contraste(carbon, surface)).toBeGreaterThanOrEqual(AA);
    expect(contraste(suave, surface)).toBeGreaterThanOrEqual(AA);
    expect(contraste(suave, crema)).toBeGreaterThanOrEqual(AA);
    expect(suave).toBe(mezcla(carbon, surface, 0.74));
    /* El teal del módulo Espera solo sobrevive cuando el local no eligió color:
     * ahí el fondo es el crema de Cicalino y da de sobra para el número. */
    expect(contraste(teal, crema)).toBeGreaterThanOrEqual(AA_GRANDE);
  });
});

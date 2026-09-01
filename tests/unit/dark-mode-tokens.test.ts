import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

/* El tema tiene tres bloques: claro, oscuro por sistema y oscuro forzado por
 * el toggle. Un token definido en uno solo se ve bien en una preferencia y
 * mal en otra, que es exactamente lo que pasaba con los estados del panel. */
const BLOQUES = [
  { nombre: "claro", desde: ":root {", hasta: "@media (prefers-color-scheme: dark)" },
  {
    nombre: "oscuro por sistema",
    desde: "@media (prefers-color-scheme: dark)",
    hasta: '/* Oscuro forzado por el toggle */',
  },
  {
    nombre: "oscuro forzado",
    desde: ':root[data-theme="dark"] {',
    hasta: "@theme inline",
  },
];

const TOKENS = [
  "--curso",
  "--curso-fondo",
  "--curso-borde",
  "--ok",
  "--ok-fondo",
  "--ok-borde",
  "--alerta",
  "--alerta-fondo",
  "--alerta-borde",
];

const trozo = (desde: string, hasta: string) => {
  const i = css.indexOf(desde);
  const j = css.indexOf(hasta, i + desde.length);
  expect(i, `no se encontró ${desde}`).toBeGreaterThan(-1);
  expect(j, `no se encontró ${hasta}`).toBeGreaterThan(i);
  return css.slice(i, j);
};

describe("Tokens de estado en los tres temas", () => {
  for (const b of BLOQUES) {
    it(`el bloque ${b.nombre} define los nueve`, () => {
      const seccion = trozo(b.desde, b.hasta);
      for (const tk of TOKENS) {
        expect(seccion, `${tk} en ${b.nombre}`).toMatch(
          new RegExp(`${tk}\\s*:`),
        );
      }
    });
  }

  it("están expuestos como utilidades de Tailwind", () => {
    const tema = trozo("@theme inline", "--font-sans");
    for (const tk of TOKENS) {
      expect(tema).toContain(`--color-${tk.slice(2)}: var(${tk});`);
    }
  });

  it("el claro y el oscuro no comparten los mismos valores", () => {
    const claro = trozo(":root {", "@media (prefers-color-scheme: dark)");
    const oscuro = trozo(':root[data-theme="dark"] {', "@theme inline");
    const valor = (seccion: string, tk: string) =>
      seccion.match(new RegExp(`${tk}\\s*:\\s*([^;]+);`))?.[1]?.trim();
    for (const tk of TOKENS) {
      expect(valor(oscuro, tk), `${tk} quedó igual en los dos temas`).not.toBe(
        valor(claro, tk),
      );
    }
  });
});

/* Los pasteles crudos de Tailwind no tienen variante oscura: un bg-amber-100
 * con text-amber-900 queda como un bloque claro con texto casi negro sobre el
 * fondo azul noche. En las pantallas de trabajo van los tokens. */
describe("Pantallas de trabajo sin pasteles solo-claros", () => {
  const pantallas = [
    "src/app/(app)/panel/page.tsx",
    "src/app/(app)/panel/espera/page.tsx",
    "src/app/(app)/panel/metrics/page.tsx",
    "src/components/panel/OrderCard.tsx",
    "src/components/panel/SubscriptionCard.tsx",
  ];
  /* Los dos modos de falla concretos: una superficie pastel clara, y texto
   * casi negro. Un bloque oscuro con texto claro (bg-amber-950 text-amber-100)
   * se lee bien en los dos temas, así que no cuenta. */
  const pastel =
    /\bbg-(?:amber|emerald|rose|red)-(?:50|100|200)\b|\btext-(?:amber|emerald|rose|red)-(?:700|800|900)\b/;

  for (const f of pantallas) {
    it(`${f} no usa fondos pastel sin variante oscura`, () => {
      const src = readFileSync(join(root, f), "utf8");
      const malas = src
        .split("\n")
        .map((l, i) => [i + 1, l] as const)
        .filter(([, l]) => pastel.test(l) && !l.includes("dark:"));
      expect(malas.map(([i, l]) => `${i}: ${l.trim()}`)).toEqual([]);
    });
  }

  it("el pill de estado del pedido sale de los tokens", () => {
    const src = readFileSync(
      join(root, "src/components/panel/OrderCard.tsx"),
      "utf8",
    );
    expect(src).toContain("bg-curso-fondo text-curso");
    expect(src).toContain("bg-ok-fondo text-ok");
    expect(src).toContain("bg-alerta-fondo text-alerta");
  });
});

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
  /* El color de cada módulo también: si Pagos quedara definido solo en claro,
   * en oscuro heredaría el ámbar oscuro y desaparecería contra el fondo. */
  "--pagos",
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
    "src/app/(app)/panel/pedidos/page.tsx",
    "src/app/(app)/panel/espera/page.tsx",
    "src/components/panel/mesas/JornadaBoard.tsx",
    "src/components/panel/mesas/WeekCalendar.tsx",
    "src/components/panel/mesas/DayShiftModal.tsx",
    "src/components/panel/mesas/RangeAssignModal.tsx",
    "src/components/panel/mesas/MesaChip.tsx",
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

/* La mascota es un PNG de un solo color: azul o crema. Si la variante no
 * acompaña al fondo, desaparece — crema sobre blanco y azul sobre azul noche
 * son el mismo bug visto de los dos lados.
 *
 * En el comensal el fondo lo elige el local, no el celular del cliente, así
 * que ahí manda `data-scheme` y no el tema del dispositivo. Medido en
 * Chromium sobre este mismo bloque de CSS:
 *
 *                       sin marca   marca clara   marca oscura
 *   device light         azul         azul          crema
 *   device dark          crema        azul          crema
 *   panel data-theme     sigue        azul          crema
 */
describe("Mascota: contraste contra el fondo", () => {
  const bloque = css.slice(
    css.indexOf("/* ---- Swap de imagenes por tema"),
    css.indexOf("/* Scroll interno de modales"),
  );

  it("el fondo de marca decide en las dos direcciones", () => {
    expect(bloque).toContain(':root [data-scheme="dark"] .on-light');
    expect(bloque).toContain(':root [data-scheme="dark"] .on-dark');
    /* La clara es la que faltaba: sin ella, un local de fondo blanco depende
     * de que theme-init.js alcance a forzar el tema antes de pintar. */
    expect(bloque).toContain(':root [data-scheme="light"] .on-dark');
    expect(bloque).toContain(':root [data-scheme="light"] .on-light');
  });

  it("la marca gana por orden, así que va después del tema del dispositivo", () => {
    const tema = bloque.indexOf('[data-theme="dark"] .on-light');
    const sistema = bloque.indexOf("prefers-color-scheme: dark");
    const marca = bloque.indexOf('[data-scheme=');
    expect(tema).toBeGreaterThan(-1);
    expect(sistema).toBeGreaterThan(-1);
    /* Misma especificidad (0,3,0): si la marca fuera antes, perdería. */
    expect(marca).toBeGreaterThan(tema);
    expect(marca).toBeGreaterThan(sistema);
  });

  it("las dos variantes se renderizan siempre y el CSS esconde una", () => {
    const img = readFileSync(join(root, "src/components/ui/ThemedImg.tsx"), "utf8");
    expect(img).toContain("on-light");
    expect(img).toContain("on-dark");
    /* Elegir en JS traería desajuste de hidratación y parpadeo. */
    expect(img).not.toContain("useEffect");
    expect(img).not.toContain("matchMedia");
  });
});

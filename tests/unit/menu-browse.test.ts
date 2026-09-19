import { describe, it, expect } from "vitest";
import {
  agruparPorCategoria,
  buscarPlatos,
  categoriaActiva,
  normalizar,
  CARTA_CON_INDICE,
  MENU_CON_BUSCADOR,
} from "@/lib/menuBrowse";
import type { GuestMenuProduct } from "@/components/customer/table/TableGuestApp";

const plato = (
  name: string,
  category: string | null,
  description: string | null = null,
): GuestMenuProduct => ({
  id: name.toLowerCase().replace(/\W+/g, "-"),
  name,
  description,
  category,
  price: 1000,
});

describe("agrupar la carta", () => {
  it("respeta el orden que armó el local", () => {
    /* El servidor ya ordenó por categoría y por posición. Reordenar acá sería
       pisar la decisión de quien escribió la carta. */
    const cats = agruparPorCategoria(
      [
        plato("Empanadas", "Entradas"),
        plato("Provoleta", "Entradas"),
        plato("Milanesa", "Principales"),
        plato("Flan", "Postres"),
      ],
      "Otros",
    );
    expect(cats.map((c) => c.nombre)).toEqual(["Entradas", "Principales", "Postres"]);
    expect(cats[0].items.map((p) => p.name)).toEqual(["Empanadas", "Provoleta"]);
  });

  it("lo que no tiene categoría cae en una sola", () => {
    const cats = agruparPorCategoria(
      [plato("Agua", null), plato("Pan", "   "), plato("Café", "Postres")],
      "Otros",
    );
    expect(cats.map((c) => c.nombre)).toEqual(["Otros", "Postres"]);
    expect(cats[0].items).toHaveLength(2);
  });

  it("los id sirven como ancla del DOM", () => {
    const cats = agruparPorCategoria(
      [plato("a", "Para compartir"), plato("b", "Postres y café")],
      "Otros",
    );
    expect(cats.map((c) => c.id)).toEqual(["para-compartir", "postres-y-cafe"]);
    for (const c of cats) expect(c.id).toMatch(/^[a-z0-9-]+$/);
  });

  it("dos categorías que darían el mismo id no se pisan", () => {
    /* Con el id repetido el salto lleva siempre a la primera, y la segunda
       categoría queda inalcanzable desde el índice. */
    const cats = agruparPorCategoria(
      [plato("a", "Para compartir"), plato("b", "para-compartir"), plato("c", "PARA COMPARTIR")],
      "Otros",
    );
    expect(new Set(cats.map((c) => c.id)).size).toBe(cats.length);
  });

  it("una categoría sin letras igual tiene un id usable", () => {
    const cats = agruparPorCategoria([plato("a", "🍷"), plato("b", "···")], "Otros");
    for (const c of cats) expect(c.id).toMatch(/^[a-z0-9-]+$/);
    expect(new Set(cats.map((c) => c.id)).size).toBe(2);
  });
});

describe("buscar en la carta", () => {
  const cats = agruparPorCategoria(
    [
      plato("Milanesa napolitana", "Principales", "Con papas fritas"),
      plato("Sándwich de milanesa", "Sándwiches", "Lomo, lechuga y tomate"),
      plato("Ensalada César", "Ensaladas", "Con pollo y croutons"),
      plato("Flan casero", "Postres", "Con dulce de leche"),
      plato("Papas bravas", "Para compartir", "Con salsa picante"),
    ],
    "Otros",
  );

  it("el nombre que empieza con lo buscado va primero", () => {
    /* Quien escribe "mila" quiere la milanesa, no el sándwich que la
       menciona. El filtro es fácil; el orden es lo que decide si sirve. */
    const r = buscarPlatos(cats, "mila");
    expect(r.map((h) => h.producto.name)).toEqual([
      "Milanesa napolitana",
      "Sándwich de milanesa",
    ]);
  });

  it("encuentra sin acentos y sin importar mayúsculas", () => {
    expect(buscarPlatos(cats, "cesar").map((h) => h.producto.name)).toEqual(["Ensalada César"]);
    expect(buscarPlatos(cats, "SÁNDWICH")).toHaveLength(1);
    expect(normalizar("Jamón")).toBe("jamon");
  });

  it("busca también en la descripción, pero después", () => {
    const r = buscarPlatos(cats, "papas");
    expect(r.map((h) => h.producto.name)).toEqual(["Papas bravas", "Milanesa napolitana"]);
  });

  it("cada resultado dice de qué categoría salió", () => {
    /* En una lista mezclada, saber que el flan es de Postres evita el segundo
       viaje para ubicarlo. */
    expect(buscarPlatos(cats, "flan")[0].categoria).toBe("Postres");
  });

  it("sin término no busca nada", () => {
    expect(buscarPlatos(cats, "")).toEqual([]);
    expect(buscarPlatos(cats, "   ")).toEqual([]);
  });

  it("un plato aparece una sola vez", () => {
    /* "Milanesa napolitana" tiene el término en el nombre; no puede volver a
       colarse por la descripción. */
    const r = buscarPlatos(cats, "milanesa");
    expect(new Set(r.map((h) => h.producto.id)).size).toBe(r.length);
  });
});

describe("categoría activa", () => {
  const corte = 150;

  it("arriba de todo, la primera", () => {
    expect(categoriaActiva([200, 800, 1500], corte)).toBe(0);
  });

  it("la última que ya pasó lo que está pegado arriba", () => {
    /* Con el título de Principales justo abajo del corte seguís en Entradas,
       aunque se asome el primer principal: el cartel manda, no la tarjeta. */
    expect(categoriaActiva([-300, 160, 900], corte)).toBe(0);
    expect(categoriaActiva([-300, 140, 900], corte)).toBe(1);
    expect(categoriaActiva([-900, -400, 100], corte)).toBe(2);
  });

  it("al final de la página queda la última", () => {
    expect(categoriaActiva([-2000, -1500, -800], corte)).toBe(2);
  });

  it("con una sola categoría no se va de rango", () => {
    expect(categoriaActiva([50], corte)).toBe(0);
    expect(categoriaActiva([], corte)).toBe(0);
  });
});

describe("cuándo aparece cada ayuda", () => {
  it("los umbrales son los que se discutieron", () => {
    /* Están acá para que cambiarlos sea una decisión y no un descuido. */
    expect(CARTA_CON_INDICE).toBe(3);
    expect(MENU_CON_BUSCADOR).toBe(30);
  });
});

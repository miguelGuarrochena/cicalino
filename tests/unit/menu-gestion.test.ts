import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyMapping,
  draftFromTable,
  guessColumn,
  parseDelimited,
} from "@/lib/menuImport";
import { menuCategorySchema, menuProductSchema, parseInput } from "@/lib/schemas";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Menú — gestión de carta", () => {
  it("la carta es una página propia, no un bloque de Configuración", () => {
    const config = read("src/app/(app)/panel/config/page.tsx");
    const nav = read("src/components/panel/config/ConfigNav.tsx");
    const page = read("src/app/(app)/panel/config/carta/page.tsx");
    expect(config).not.toContain("MenuEditor");
    expect(config).not.toContain("MenuManager");
    expect(nav).toContain('"/panel/config/carta"');
    expect(page).toContain("MenuManager");
  });

  it("productos sigue siendo la fuente de verdad y categorias no duplica el precio", () => {
    const sql = read("supabase/menu-categorias.sql");
    const guest = read("src/lib/server/tableGuest.ts");
    expect(sql).toMatch(/create table if not exists public\.categorias/);
    expect(sql).toMatch(/add column if not exists costo/);
    expect(sql).toMatch(/add column if not exists imagen_url/);
    expect(sql).toMatch(/categorias alta/);
    expect(sql).toContain("productos.categoria stays the category name");
    expect(guest).toContain("imagen_url");
    expect(guest).not.toMatch(/select\("id, nombre, descripcion, categoria, precio, costo/);
    expect(guest).not.toContain("costo");
  });

  it("el schema de producto acepta costo e imagen y rechaza un precio 0", () => {
    const ok = parseInput(menuProductSchema, {
      name: "Muzza",
      category: "Pizzas",
      price: 12000,
      cost: 4000,
      imageUrl: "https://cdn.example/muzza.jpg",
      active: true,
      order: 0,
    });
    expect(ok.ok).toBe(true);
    expect(
      parseInput(menuProductSchema, { name: "Muzza", price: 0, active: true, order: 0 }).ok,
    ).toBe(false);
    expect(parseInput(menuCategorySchema, { name: "Pizzas", active: true, order: 1 }).ok).toBe(
      true,
    );
  });
});

describe("Menú — importar CSV", () => {
  it("detecta columnas en castellano y arma filas con error si falta el precio", () => {
    const table = parseDelimited(
      "Categoría,Producto,Descripción,Precio,Costo\nPizzas,Margherita,Salsa y mozzarella,12000,5000\nPizzas,Napolitana,,no-num,6000",
    );
    const draft = draftFromTable(table);
    expect(draft).not.toBeNull();
    expect(guessColumn("Precio")).toBe("price");
    expect(guessColumn("Categoría")).toBe("category");
    const rows = applyMapping(draft!);
    expect(rows[0]).toMatchObject({
      category: "Pizzas",
      name: "Margherita",
      price: 12000,
      cost: 5000,
      error: null,
    });
    expect(rows[1]?.error).toBeTruthy();
  });

  it("mapea headers en inglés y acepta CSV con punto y coma", () => {
    const table = parseDelimited("Category;Item;Price\nDrinks;Soda;2000");
    const draft = draftFromTable(table);
    const rows = applyMapping(draft!);
    expect(rows[0]).toMatchObject({ name: "Soda", category: "Drinks", price: 2000, error: null });
  });
});

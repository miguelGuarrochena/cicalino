import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyMapping,
  draftFromTable,
  guessColumn,
  parseDelimited,
  parseMoney,
} from "@/lib/menuImport";
import { guestMenuGroups, orderForGuests } from "@/lib/menuView";
import { menuCategorySchema, menuProductSchema, parseInput } from "@/lib/schemas";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Menú — gestión de carta", () => {
  it("el menú es una página propia fuera del layout de Configuración", () => {
    const config = read("src/app/(app)/panel/config/page.tsx");
    const nav = read("src/components/panel/config/ConfigNav.tsx");
    const page = read("src/app/(app)/panel/menu/page.tsx");
    const oldRoute = read("src/app/(app)/panel/config/carta/page.tsx");
    expect(config).not.toMatch(/MenuEditor|MenuManager|MenuWorkspace/);
    expect(nav).toContain('href: "/panel/menu"');
    expect(page).toContain("MenuWorkspace");
    expect(oldRoute).toContain('redirect("/panel/menu")');
    expect(existsSync(join(root, "src/components/panel/config/menu"))).toBe(false);
    expect(existsSync(join(root, "src/components/panel/config/MenuEditor.tsx"))).toBe(false);
  });

  it("la página tiene las cuatro acciones principales y CRUD de categorías y productos", () => {
    const ws = read("src/components/panel/menu/MenuWorkspace.tsx");
    for (const key of ["carta.crearProducto", "carta.crearCategoria", "carta.importarExcel", "carta.verMenu"]) {
      expect(ws).toContain(`"${key}"`);
    }
    for (const fn of [
      "saveMenuProduct",
      "deleteMenuProduct",
      "reorderMenuProducts",
      "saveMenuCategory",
      "deleteMenuCategory",
      "reorderMenuCategories",
      "importMenuRows",
    ]) {
      expect(ws).toContain(`${fn}(`);
    }
  });

  it("cargar categorías típicas avisa si el alta falla", () => {
    const ws = read("src/components/panel/menu/MenuWorkspace.tsx");
    const seed = ws.slice(ws.indexOf("const seedDefaults"), ws.indexOf("const runImport"));
    expect(seed).toContain("saveMenuCategory(");
    expect(seed).toContain('toast(t("carta.error"), "error")');
    expect(seed).toContain("finally");
  });

  it("la vista previa no muestra costos ni controles", () => {
    const preview = read("src/components/panel/menu/MenuPreviewDialog.tsx");
    expect(preview).not.toMatch(/\.cost\b|costo|AvailabilitySwitch|RowMenu/);
    expect(preview).toContain("guestMenuGroups");
  });

  it("productos sigue siendo la fuente de verdad y categorias no duplica el precio", () => {
    const sql = read("supabase/menu-categorias.sql");
    const guest = read("src/lib/server/tableGuest.ts");
    expect(sql).toMatch(/create table if not exists public\.categorias/);
    expect(sql).toMatch(/add column if not exists costo/);
    expect(sql).toMatch(/add column if not exists imagen_url/);
    expect(sql).toMatch(/categorias alta/);
    expect(sql).toContain("notify pgrst, 'reload schema'");
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

describe("Menú — precios como se escriben en Argentina", () => {
  it("12.000 son doce mil, no doce", () => {
    const cases: [string, number | null][] = [
      ["12000", 12000],
      ["12.000", 12000],
      ["$ 12.000", 12000],
      ["1.234.567", 1234567],
      ["12.000,50", 12001],
      ["12,000.50", 12001],
      ["12,5", 13],
      ["12.5", 13],
      ["doce", null],
      ["", null],
    ];
    for (const [raw, expected] of cases) expect(parseMoney(raw), raw).toBe(expected);
  });
});

describe("Menú — lo que ve el comensal", () => {
  const cats = [
    { name: "Bebidas", active: true, order: 2 },
    { name: "Pizzas", active: true, order: 1 },
    { name: "Postres", active: false, order: 0 },
  ];
  const prods = [
    { id: "1", name: "Agua", category: "bebidas", active: true, order: 0 },
    { id: "2", name: "Napolitana", category: "Pizzas", active: true, order: 1 },
    { id: "3", name: "Margherita", category: "Pizzas", active: true, order: 0 },
    { id: "4", name: "4 Quesos", category: "Pizzas", active: false, order: 2 },
    { id: "5", name: "Flan", category: "Postres", active: true, order: 0 },
    { id: "6", name: "Especial", category: null, active: true, order: 0 },
  ];

  it("respeta el orden de categorías y productos y oculta lo no disponible", () => {
    const groups = guestMenuGroups(cats, prods, "Otros");
    expect(groups.map((g) => g.name)).toEqual(["Pizzas", "Bebidas", "Otros"]);
    expect(groups[0]!.items.map((p) => p.name)).toEqual(["Margherita", "Napolitana"]);
    expect(orderForGuests(cats, prods).map((p) => p.id)).toEqual(["3", "2", "1", "6"]);
  });
});


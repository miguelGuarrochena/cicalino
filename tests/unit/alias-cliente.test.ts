import { describe, it, expect } from "vitest";
import {
  LAST_VISIT_MAX_MS,
  parseLastVisit,
} from "@/lib/customerLastVisit";
import { customerAliasSchema } from "@/lib/schemas";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("parseLastVisit", () => {
  const now = 1_700_000_000_000;
  const base = {
    kind: "p" as const,
    token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    label: "42",
    savedAt: now - 60_000,
  };

  it("acepta un pedido guardado", () => {
    const v = parseLastVisit(JSON.stringify(base), now);
    expect(v).toMatchObject({ kind: "p", label: "42" });
  });

  it("acepta una espera", () => {
    const v = parseLastVisit(
      JSON.stringify({ ...base, kind: "e", label: "García" }),
      now,
    );
    expect(v?.kind).toBe("e");
    expect(v?.label).toBe("García");
  });

  it("descarta vencidos", () => {
    const v = parseLastVisit(
      JSON.stringify({ ...base, savedAt: now - LAST_VISIT_MAX_MS - 1 }),
      now,
    );
    expect(v).toBeNull();
  });

  it("descarta JSON basura", () => {
    expect(parseLastVisit("{", now)).toBeNull();
    expect(parseLastVisit(null, now)).toBeNull();
    expect(parseLastVisit(JSON.stringify({ kind: "p" }), now)).toBeNull();
  });
});

describe("customerAliasSchema", () => {
  it("acepta nombres cortos", () => {
    expect(customerAliasSchema.parse("Miguel")).toBe("Miguel");
    expect(customerAliasSchema.parse("  maría  ")).toBe("maría");
    expect(customerAliasSchema.parse("O'Connor")).toBe("O'Connor");
  });

  it("vacío borra el alias", () => {
    expect(customerAliasSchema.parse("")).toBeNull();
    expect(customerAliasSchema.parse("   ")).toBeNull();
  });

  it("rechaza corto, largo o símbolos", () => {
    expect(customerAliasSchema.safeParse("A").success).toBe(false);
    expect(customerAliasSchema.safeParse("x".repeat(25)).success).toBe(false);
    expect(customerAliasSchema.safeParse("http://x").success).toBe(false);
  });
});

describe("alias-cliente.sql", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/alias-cliente.sql"),
    "utf8",
  );
  const orden = JSON.parse(
    readFileSync(join(process.cwd(), "supabase/orden.json"), "utf8"),
  ) as string[];

  it("agrega la columna y el buscador", () => {
    expect(sql).toContain("alias_cliente");
    expect(sql).toContain("pedidos_alias_cliente_len");
    expect(sql).toContain("lower(coalesce(alias_cliente, ''))");
    expect(sql).toContain("'alias_cliente', p.alias_cliente");
  });

  it("está al final de orden.json", () => {
    expect(orden.at(-1)).toBe("alias-cliente.sql");
  });
});

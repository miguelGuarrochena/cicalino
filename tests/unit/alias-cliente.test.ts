import { describe, it, expect } from "vitest";
import {
  LAST_VISIT_MAX_MS,
  parseLastVisit,
  lastVisitStillOpen,
  shouldShowLastVisit,
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
    expect(sql).toContain("estado in ('creado', 'en_preparacion', 'listo')");
  });

  it("está en orden.json", () => {
    expect(orden).toContain("alias-cliente.sql");
    /* Los dos redefinen pedidos_pagina, así que lo que importa es el orden
     * relativo entre ellos. Antes esto se pedía como "es el último de la
     * lista", que se rompía sola con el próximo script de cualquier tema —y
     * de hecho pedidos-avisos-activos.sql la volvió a redefinir después. */
    expect(orden.indexOf("alias-busca-activos.sql")).toBeGreaterThan(
      orden.indexOf("alias-cliente.sql"),
    );
  });
});

describe("lastVisitStillOpen", () => {
  it("un pedido retirado no se reabre: hay que crear otro", () => {
    expect(lastVisitStillOpen("p", "creado")).toBe(true);
    expect(lastVisitStillOpen("p", "listo")).toBe(true);
    expect(lastVisitStillOpen("p", "retirado")).toBe(false);
    expect(lastVisitStillOpen("p", "cancelado")).toBe(false);
  });

  it("una espera sentada no se reabre", () => {
    expect(lastVisitStillOpen("e", "esperando")).toBe(true);
    expect(lastVisitStillOpen("e", "avisado")).toBe(true);
    expect(lastVisitStillOpen("e", "sentado")).toBe(false);
  });

  it("shouldShowLastVisit no resucita un QR muerto", () => {
    expect(
      shouldShowLastVisit({ kind: "p", ok: false, reason: "not-found" }),
    ).toBe(false);
    expect(
      shouldShowLastVisit({ kind: "p", ok: true, status: "retirado" }),
    ).toBe(false);
    expect(
      shouldShowLastVisit({ kind: "p", ok: true, status: "creado" }),
    ).toBe(true);
    expect(
      shouldShowLastVisit({
        kind: "p",
        ok: false,
        reason: "not-configured",
      }),
    ).toBe(true);
  });
});

describe("alias-busca-activos.sql", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/alias-busca-activos.sql"),
    "utf8",
  );

  it("el alias no matchea pedidos ya retirados", () => {
    expect(sql).toMatch(
      /alias_cliente[\s\S]*estado in \('creado', 'en_preparacion', 'listo'\)/,
    );
  });
});

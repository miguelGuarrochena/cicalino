import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const fix = readFileSync(join(root, "supabase/security-fixes-10.sql"), "utf8");
const orders = readFileSync(join(root, "src/lib/data/orders.ts"), "utf8");
const panel = readFileSync(
  join(root, "src/app/(app)/panel/page.tsx"),
  "utf8",
);

describe("Medium — crear_pedido atómico (referencia)", () => {
  it("security-fixes-10 define crear_pedido con lock por local", () => {
    expect(fix).toMatch(
      /create\s+or\s+replace\s+function\s+public\.crear_pedido/i,
    );
    expect(fix).toMatch(/for update/i);
    expect(fix).toContain("local_operativo");
    expect(fix).toContain("puede_ver_local");
    expect(fix).toContain("referencia-duplicada");
  });

  it("asigna max+1 cuando p_referencia viene vacía", () => {
    expect(fix).toMatch(/substring\(referencia from '\^\[0-9\]\+'/);
    expect(fix).toMatch(/v_max \+ 1/);
  });

  it("revoke anon y grant authenticated", () => {
    expect(fix).toMatch(/revoke all on function public\.crear_pedido/i);
    expect(fix).toMatch(/from public, anon/i);
    expect(fix).toMatch(
      /grant execute on function public\.crear_pedido[\s\S]*to authenticated/i,
    );
  });

  it("insertOrder usa el RPC en vez de insert directo", () => {
    expect(orders).toContain('rpc("crear_pedido"');
    expect(orders).not.toMatch(
      /\.from\("pedidos"\)\s*\.insert\(/,
    );
  });

  it("modo pedido no manda el número desde el cliente", () => {
    expect(panel).toContain("handleCreate(null)");
    expect(panel).not.toMatch(/handleCreate\(String\(nextNumero\)\)/);
  });

  it("doble tap en modo pedido no dispara dos altas", () => {
    expect(panel).toContain("creatingRef");
    expect(panel).toMatch(/if \(creatingRef\.current\) return/);
    expect(panel).toMatch(/creatingRef\.current = true/);
    expect(panel).toMatch(/disabled=\{creating\}/);
  });

  it("chequeo-migraciones registra security-fixes-10", () => {
    const chequeo = readFileSync(
      join(root, "supabase/chequeo-migraciones.sql"),
      "utf8",
    );
    expect(chequeo).toContain("('security-fixes-10.sql', 'function', 'crear_pedido', 45)");
    expect(chequeo).toContain(
      "('security-fixes-10.sql', 'security-fixes-01.sql, security-fixes-04.sql, corte-por-impago.sql, pedidos-paginado.sql')",
    );
  });
});

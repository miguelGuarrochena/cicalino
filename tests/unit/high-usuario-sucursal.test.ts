import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const fixSql = readFileSync(
  join(root, "supabase/security-fixes-07.sql"),
  "utf8",
);
const chequeoSql = readFileSync(
  join(root, "supabase/chequeo-usuario-sucursal.sql"),
  "utf8",
);
const historico = readFileSync(
  join(root, "supabase/usuarios-sucursales.sql"),
  "utf8",
);
const teamSrc = readFileSync(join(root, "src/lib/actions/team.ts"), "utf8");

describe("High — usuario_sucursal write policies (security-fixes-07)", () => {
  it("elimina la policy FOR ALL histórica", () => {
    expect(fixSql).toMatch(
      /drop\s+policy\s+if\s+exists\s+"acceso de mi org"\s+on\s+public\.usuario_sucursal/i,
    );
  });

  it("crea SELECT separado (no FOR ALL)", () => {
    expect(fixSql).toMatch(
      /create\s+policy\s+"usuario_sucursal select"\s+on\s+public\.usuario_sucursal\s+for\s+select/i,
    );
    expect(fixSql).not.toMatch(
      /create\s+policy\s+"usuario_sucursal select"[\s\S]*?for\s+all/i,
    );
  });

  it("escritura solo via policies admin (insert/update/delete)", () => {
    expect(fixSql).toMatch(
      /create\s+policy\s+"usuario_sucursal insert admin"[\s\S]*?for\s+insert/i,
    );
    expect(fixSql).toMatch(
      /create\s+policy\s+"usuario_sucursal update admin"[\s\S]*?for\s+update/i,
    );
    expect(fixSql).toMatch(
      /create\s+policy\s+"usuario_sucursal delete admin"[\s\S]*?for\s+delete/i,
    );
  });

  it("las policies de escritura exigen admin o superadmin", () => {
    const insertBlock =
      fixSql.match(
        /create\s+policy\s+"usuario_sucursal insert admin"[\s\S]*?;/i,
      )?.[0] ?? "";
    expect(insertBlock).toMatch(/auth_rol\(\)\s*=\s*'superadmin'/);
    expect(insertBlock).toMatch(/auth_rol\(\)\s*=\s*'admin'/);
    expect(insertBlock.toLowerCase()).not.toContain("'supervisor'");
  });

  it("un supervisor no aparece como rol autorizado a escribir", () => {
    const writeBlocks = [
      ...(fixSql.match(
        /create\s+policy\s+"usuario_sucursal (insert|update|delete) admin"[\s\S]*?;/gi,
      ) ?? []),
    ];
    expect(writeBlocks.length).toBe(3);
    for (const block of writeBlocks) {
      expect(block.toLowerCase()).not.toMatch(/=\s*'supervisor'/);
    }
  });

  it("el chequeo verifica ausencia de la policy FOR ALL vieja", () => {
    expect(chequeoSql).toContain("sin_for_all_vieja");
    expect(chequeoSql).toContain("acceso de mi org");
    expect(chequeoSql).toContain("policies_escritura");
  });
});

describe("High — call path legítimo no se rompe", () => {
  it("grantAppAccess / revokeAppAccess usan admin client (service_role) y gatean a admin/superadmin", () => {
    expect(teamSrc).toContain("createAdminSupabase");
    expect(teamSrc).toMatch(
      /perfil\.rol\s*!==\s*["']admin["']\s*&&\s*perfil\.rol\s*!==\s*["']superadmin["']/,
    );
    expect(teamSrc).toMatch(/\.from\(\s*["']usuario_sucursal["']\s*\)/);
    expect(teamSrc).toContain("grantAppAccess");
    expect(teamSrc).toContain("revokeAppAccess");
  });

  it("el script histórico usuarios-sucursales.sql no se reescribe (fix aditivo)", () => {
    expect(historico).toContain('"acceso de mi org"');
    expect(historico).toMatch(/for\s+all/i);
    expect(fixSql).toContain("drop policy if exists \"acceso de mi org\"");
  });
});

describe("High — chequeo-migraciones registra el fix", () => {
  it("requisitos incluye security-fixes-07.sql", () => {
    const chequeo = readFileSync(
      join(root, "supabase/chequeo-migraciones.sql"),
      "utf8",
    );
    expect(chequeo).toContain(
      "('security-fixes-07.sql', 'usuarios-sucursales.sql, setup.sql')",
    );
  });
});

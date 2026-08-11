import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const fixSql = readFileSync(
  join(root, "supabase/security-fixes-05.sql"),
  "utf8",
);
const chequeoSql = readFileSync(
  join(root, "supabase/chequeo-purgar-push.sql"),
  "utf8",
);
const cronSrc = readFileSync(
  join(root, "src/app/api/cron/cobros/route.ts"),
  "utf8",
);
const pushIndices = readFileSync(
  join(root, "supabase/push-indices.sql"),
  "utf8",
);
const reservasExpirar = readFileSync(
  join(root, "supabase/reservas-expirar.sql"),
  "utf8",
);

describe("Critical #2 — purgar_push_viejas grants (security-fixes-05)", () => {
  it("revoca EXECUTE a public, anon y authenticated", () => {
    expect(fixSql).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.purgar_push_viejas\s*\(\s*integer\s*\)/i,
    );
    expect(fixSql.toLowerCase()).toContain("from public, anon, authenticated");
  });

  it("otorga EXECUTE explícitamente a service_role", () => {
    expect(fixSql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.purgar_push_viejas\s*\(\s*integer\s*\)\s+to\s+service_role/i,
    );
  });

  it("sigue el mismo patrón de permisos que expirar_reservas_vencidas", () => {
    expect(reservasExpirar.toLowerCase()).toContain(
      "revoke execute on function public.expirar_reservas_vencidas()",
    );
    expect(reservasExpirar.toLowerCase()).toContain(
      "from public, anon, authenticated",
    );
  });

  it("el chequeo de permisos verifica anon/authenticated/public en false y service_role en true", () => {
    expect(chequeoSql).toContain("has_function_privilege('anon'");
    expect(chequeoSql).toContain("has_function_privilege('authenticated'");
    expect(chequeoSql).toContain("has_function_privilege('public'");
    expect(chequeoSql).toContain("has_function_privilege('service_role'");
    expect(chequeoSql).toContain("anon_puede");
    expect(chequeoSql).toContain("authenticated_puede");
    expect(chequeoSql).toContain("service_role_puede");
  });
});

describe("Critical #2 — validación de p_dias", () => {
  it("rechaza p_dias null o < 1 con RAISE EXCEPTION", () => {
    expect(fixSql).toMatch(/p_dias\s+is\s+null\s+or\s+p_dias\s*<\s*1/i);
    expect(fixSql).toMatch(/raise\s+exception\s+'p_dias debe ser >= 1'/i);
  });

  it("conserva el delete por antigüedad cuando p_dias es válido", () => {
    expect(fixSql).toMatch(
      /delete\s+from\s+public\.push_subscriptions[\s\S]*make_interval\s*\(\s*days\s*=>\s*p_dias\s*\)/i,
    );
    expect(fixSql).toMatch(/default\s+3/i);
  });

  it("el chequeo confirma que el cuerpo valida p_dias", () => {
    expect(chequeoSql).toContain("valida_p_dias");
    expect(chequeoSql).toContain("p_dias debe ser >= 1");
  });
});

describe("Critical #2 — llamador legítimo (cron / service_role)", () => {
  it("solo el cron invoca purgar_push_viejas en el código de la app", () => {
    const appHits = [
      "src/app/api/cron/cobros/route.ts",
    ];
    for (const rel of appHits) {
      expect(readFileSync(join(root, rel), "utf8")).toContain(
        "purgar_push_viejas",
      );
    }
    /* Ningún Client Component / action / data layer la llama. */
    const forbiddenRoots = [
      "src/lib/actions",
      "src/lib/data",
      "src/components",
      "src/lib/hooks",
    ];
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (/\.(ts|tsx)$/.test(name)) out.push(full);
      }
      return out;
    };
    for (const base of forbiddenRoots) {
      for (const file of walk(join(root, base))) {
        const src = readFileSync(file, "utf8");
        expect(
          src.includes("purgar_push_viejas"),
          `${file} no debería llamar purgar_push_viejas`,
        ).toBe(false);
      }
    }
  });

  it("el cron usa createAdminSupabase (service_role) y p_dias válido (= 3)", () => {
    expect(cronSrc).toContain('from "@/lib/supabase/admin"');
    expect(cronSrc).toContain("createAdminSupabase");
    expect(cronSrc).toMatch(
      /\.rpc\(\s*["']purgar_push_viejas["']\s*,\s*\{\s*p_dias:\s*3\s*\}/,
    );
    expect(cronSrc).toContain("CRON_SECRET");
  });

  it("el script histórico push-indices.sql sigue definiendo la función (greenfield)", () => {
    expect(pushIndices).toContain("purgar_push_viejas");
    expect(pushIndices).toMatch(/security\s+definer/i);
  });

  it("security-fixes-05 redefine la función (create or replace) encima del histórico", () => {
    expect(fixSql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.purgar_push_viejas/i,
    );
    expect(fixSql).toMatch(/security\s+definer/i);
    expect(fixSql).toMatch(/set\s+search_path\s*=\s*public/i);
  });
});

describe("Critical #2 — modelo de amenaza documentado en el SQL", () => {
  it("documenta que authenticated no debe poder ejecutarla", () => {
    expect(fixSql.toLowerCase()).toContain("authenticated");
    expect(fixSql.toLowerCase()).toContain("service_role");
    expect(fixSql.toLowerCase()).toContain("p_dias");
  });
});

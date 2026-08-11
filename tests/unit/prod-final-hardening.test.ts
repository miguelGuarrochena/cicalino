import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const fix = readFileSync(
  join(root, "supabase/security-fixes-15.sql"),
  "utf8",
);
const cronSrc = readFileSync(
  join(root, "src/app/api/cron/cobros/route.ts"),
  "utf8",
);
const pinAction = readFileSync(
  join(root, "src/lib/actions/pin.ts"),
  "utf8",
);
const timeClock = readFileSync(
  join(root, "src/components/panel/TimeClock.tsx"),
  "utf8",
);
const branch = readFileSync(join(root, "src/lib/data/branch.ts"), "utf8");

describe("Prod final — security-fixes-15 + hardening", () => {
  it("define pin_intentos con RLS y sin grants a authenticated", () => {
    expect(fix).toMatch(/create table if not exists public\.pin_intentos/i);
    expect(fix).toMatch(/enable row level security/i);
    expect(fix).toMatch(
      /revoke all on table public\.pin_intentos from public, anon, authenticated/i,
    );
  });

  it("verificar_pin_empleado rate-limita por uid+empleado", () => {
    expect(fix).toMatch(/from public\.pin_intentos/i);
    expect(fix).toMatch(/v_max int := 10/);
    expect(fix).toMatch(/v_ventana_sec int := 60/);
  });

  it("crear_pedido calcula jornada desde locales.hora_corte", () => {
    expect(fix).toMatch(/coalesce\(l\.hora_corte, 6\)/);
    expect(fix).toMatch(/America\/Argentina\/Buenos_Aires/);
    expect(fix).toMatch(/p_desde\/p_expira se ignoran/);
  });

  it("cron aborta si el lock RPC falla (fail-closed)", () => {
    expect(cronSrc).toContain("lock-unavailable");
    expect(cronSrc).toContain("status: 503");
    expect(cronSrc).not.toMatch(/sigo sin él/);
  });

  it("fichaje usa server action con rate limit, no helper browser", () => {
    expect(timeClock).toContain("verifyEmployeePinAction");
    expect(timeClock).not.toContain('from "@/lib/data/branch"');
    expect(pinAction).toContain("sharedRateLimit");
    expect(pinAction).toContain("verificar_pin_empleado");
    expect(branch).not.toContain("verifyEmployeePin");
  });
});

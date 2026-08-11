import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("PIN fichaje smoke — grants y flujo legítimo", () => {
  const fix15 = readFileSync(join(root, "supabase/security-fixes-15.sql"), "utf8");
  const fix16 = readFileSync(join(root, "supabase/security-fixes-16.sql"), "utf8");
  const pinAction = readFileSync(join(root, "src/lib/actions/pin.ts"), "utf8");
  const timeClock = readFileSync(
    join(root, "src/components/panel/TimeClock.tsx"),
    "utf8",
  );
  const server = readFileSync(join(root, "src/lib/supabase/server.ts"), "utf8");

  it("PUBLIC/anon no necesitan EXECUTE: flujo usa sesión authenticated", () => {
    expect(timeClock).toContain("verifyEmployeePinAction");
    expect(pinAction).toContain("createServerSupabase");
    expect(pinAction).toContain('rpc("verificar_pin_empleado"');
    expect(pinAction).not.toContain("createAdminSupabase");
    expect(server).toContain("createServerClient");
  });

  it("#15 y #16 revocan public/anon y otorgan solo authenticated", () => {
    for (const src of [fix15, fix16]) {
      expect(src).toMatch(
        /revoke all on function public\.verificar_pin_empleado\s*\(\s*uuid\s*,\s*text\s*\)\s*from public,\s*anon/i,
      );
      expect(src).toMatch(
        /grant execute on function public\.verificar_pin_empleado\s*\(\s*uuid\s*,\s*text\s*\)\s*to authenticated/i,
      );
    }
  });

  it("authenticated es el rol necesario (auth.uid / puede_ver_local)", () => {
    expect(fix15).toMatch(/puede_ver_local/);
    expect(fix15).toMatch(/auth\.uid\(\)/);
  });
});

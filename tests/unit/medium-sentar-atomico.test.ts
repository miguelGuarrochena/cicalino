import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { motivoOcupar } from "@/lib/espera/motivos";

const root = process.cwd();
const sql = readFileSync(
  join(root, "supabase/sentar-espera-reserva.sql"),
  "utf8",
);
const waitlist = readFileSync(join(root, "src/lib/data/waitlist.ts"), "utf8");
const hook = readFileSync(join(root, "src/lib/hooks/useWaitlist.ts"), "utf8");
const page = readFileSync(
  join(root, "src/app/(app)/panel/espera/page.tsx"),
  "utf8",
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);

describe("Medium — sentar espera/reserva atómico", () => {
  it("define sentar_espera y sentar_reserva con lock y local_operativo", () => {
    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.sentar_espera/i,
    );
    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.sentar_reserva/i,
    );
    expect(sql).toMatch(/for update/i);
    expect(sql).toContain("local_operativo");
    expect(sql).toContain("puede_ver_local");
    expect(sql).toContain("mesa-no-disponible");
    expect(sql).toContain("espera-cerrada");
    expect(sql).toContain("reserva-cerrada");
    expect(sql).toContain("mesa-reservada");
    expect(sql).toContain("p_forzar");
  });

  it("revoke anon y grant authenticated", () => {
    expect(sql).toMatch(
      /revoke all on function public\.sentar_espera[\s\S]*from public, anon/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.sentar_reserva[\s\S]*from public, anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.sentar_espera[\s\S]*to authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.sentar_reserva[\s\S]*to authenticated/i,
    );
  });

  it("el cliente llama al RPC en vez de loopear setTableState", () => {
    expect(waitlist).toContain('rpc("sentar_espera"');
    expect(waitlist).toContain('rpc("sentar_reserva"');
    expect(hook).toContain("seatWaitlist");
    expect(hook).toContain("seatReservation");
    const sentarFn = hook.slice(hook.indexOf("const sentar = async"));
    const sentarBody = sentarFn.slice(0, sentarFn.indexOf("const cancelar"));
    expect(sentarBody).not.toMatch(/setTableState/);
    const reservaFn = hook.slice(hook.indexOf("const sentarReserva = async"));
    const reservaBody = reservaFn.slice(
      0,
      reservaFn.indexOf("const cancelarReserva"),
    );
    expect(reservaBody).not.toMatch(/setTableState/);
  });

  it("el panel no cierra el modal ni festeja si el RPC falla", () => {
    expect(page).toContain("sentandoRef");
    expect(page).toContain("forzar");
    expect(page).toMatch(/if \(!res\.ok\)/);
    expect(page).toContain("motivoOcupar(res.reason");
  });

  it("chequeo-migraciones registra el script", () => {
    expect(chequeo).toContain(
      "('sentar-espera-reserva.sql', 'function', 'sentar_espera', 54)",
    );
    expect(chequeo).toContain(
      "('sentar-espera-reserva.sql', 'function', 'sentar_reserva', 54)",
    );
    expect(chequeo).toContain(
      "('sentar-espera-reserva.sql', 'sentar-walkin.sql, corte-por-impago.sql, espera-constraints.sql')",
    );
  });

  it("motivos cubren espera/reserva ya cerrada", () => {
    expect(motivoOcupar("espera-cerrada", "es")).toMatch(/cola/i);
    expect(motivoOcupar("reserva-cerrada", "es")).toMatch(/reserva/i);
    expect(motivoOcupar("mesa-no-disponible", "es")).toMatch(/ocupó/i);
  });
});

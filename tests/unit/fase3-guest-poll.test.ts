import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("FASE 3 — poll del comensal no se reinicia solo", () => {
  const src = read("src/components/customer/table/TableGuestApp.tsx");

  it("setGuest conserva la misma identidad si el poll trae el mismo comensal", () => {
    expect(src).toContain("cur && cur.id === next.id && cur.name === next.name ? cur : next");
  });

  /* El respaldo vive ahora en useTableBillLive (attachLiveRefresh): 30 s con
   * Realtime sano y 5 s caído. Sigue sin reiniciarse por render: el efecto
   * depende del id de la sesión (un string), no de objetos. */
  it("el respaldo depende del id de la sesión, no del objeto guest ni de la cuenta", () => {
    expect(src).toContain("useTableBillLive(guest ? (bill?.session.id ?? null) : null, refresh)");
    const hook = read("src/lib/hooks/useTableBillLive.ts");
    expect(hook).toContain("}, [sessionId]);");
  });

  it("el respaldo es 5 s con Realtime caído y 30 s sano, no un tick por render", () => {
    const hook = read("src/lib/hooks/useTableBillLive.ts");
    expect(hook).toContain("attachLiveRefresh(");
    expect(hook).toContain("export const GUEST_TICKS_SANO = 6;");
    expect(read("src/lib/realtime.ts")).toContain("cadaMs = 5_000");
  });
});

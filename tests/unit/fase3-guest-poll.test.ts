import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("FASE 3 — poll del comensal no se reinicia solo", () => {
  const src = read("src/components/customer/table/TableGuestApp.tsx");

  it("setGuest conserva la misma identidad si el poll trae el mismo comensal", () => {
    expect(src).toContain("cur && cur.id === next.id && cur.name === next.name ? cur : next");
  });

  it("el intervalo de poll depende del id, no del objeto guest", () => {
    expect(src).toContain("[guest?.id, refresh]");
    expect(src).not.toMatch(/\}, \[guest, refresh\]\);/);
  });

  it("el poll visible sigue siendo 5 s, no un tick por render", () => {
    expect(src).toContain("const POLL_VISIBLE_MS = 5_000");
  });
});

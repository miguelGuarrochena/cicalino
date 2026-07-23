import { describe, it, expect } from "vitest";
import {
  generarQrToken,
  finDelDiaArgentina,
  tokenVigente,
} from "@/lib/utils/token";

describe("generarQrToken", () => {
  it("genera tokens base64url de 22 chars", () => {
    const t = generarQrToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
  it("genera tokens distintos", () => {
    expect(generarQrToken()).not.toBe(generarQrToken());
  });
});

describe("finDelDiaArgentina", () => {
  it("devuelve fin del día en hora AR (UTC-3)", () => {
    // 15/01/2026 10:00 -03  →  fin del día 23:59:59.999 -03  =  16/01 02:59:59.999Z
    const desde = new Date("2026-01-15T13:00:00.000Z");
    expect(finDelDiaArgentina(desde).toISOString()).toBe(
      "2026-01-16T02:59:59.999Z",
    );
  });
});

describe("tokenVigente", () => {
  const ahora = new Date("2026-01-15T12:00:00Z");
  it("vigente si expira en el futuro", () => {
    expect(tokenVigente(new Date("2026-01-15T20:00:00Z"), ahora)).toBe(true);
  });
  it("no vigente si ya expiró", () => {
    expect(tokenVigente(new Date("2026-01-15T06:00:00Z"), ahora)).toBe(false);
  });
  it("vigente en el instante exacto de expiración", () => {
    expect(tokenVigente(ahora, ahora)).toBe(true);
  });
});

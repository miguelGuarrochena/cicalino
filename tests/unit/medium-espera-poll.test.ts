import { describe, it, expect } from "vitest";
import { WAITLIST_POLL_MS } from "@/lib/hooks/useCustomerWaitlist";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Medium — waitlist customer poll adaptativo", () => {
  it("no usa el intervalo fijo de 1.2s", () => {
    expect(WAITLIST_POLL_MS.esperando).toBeGreaterThanOrEqual(3_000);
    expect(WAITLIST_POLL_MS.avisado).toBeGreaterThanOrEqual(2_000);
    expect(WAITLIST_POLL_MS.esperando).toBeGreaterThan(WAITLIST_POLL_MS.avisado);
  });

  it("corta el poll en estados finales", () => {
    expect(WAITLIST_POLL_MS.sentado).toBe(0);
    expect(WAITLIST_POLL_MS.cancelado).toBe(0);
  });

  it("el hook ya no programa setInterval fijo de 1200ms", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/hooks/useCustomerWaitlist.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/POLL_MS\s*=\s*1200/);
    expect(src).not.toMatch(/setInterval\(\s*\(\)\s*=>\s*void load\(\),\s*POLL_MS\)/);
    expect(src).toContain("setTimeout");
    expect(src).toContain("conJitter");
  });
});

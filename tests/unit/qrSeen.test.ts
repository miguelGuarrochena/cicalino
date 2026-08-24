import { describe, it, expect } from "vitest";
import { seenAtNewer } from "@/lib/qrSeen";

describe("seenAtNewer", () => {
  it("cierra el alta cuando aparece el primer visto_en", () => {
    expect(seenAtNewer("2026-08-24T18:00:00.000Z", null)).toBe(true);
  });

  it("no cierra Ver QR si es el mismo instante con otro formato", () => {
    expect(
      seenAtNewer(
        "2026-08-24T18:00:00.000+00:00",
        "2026-08-24T18:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("cierra si el cliente volvió a entrar después", () => {
    expect(
      seenAtNewer(
        "2026-08-24T18:00:05.000Z",
        "2026-08-24T18:00:00.000Z",
      ),
    ).toBe(true);
  });
});

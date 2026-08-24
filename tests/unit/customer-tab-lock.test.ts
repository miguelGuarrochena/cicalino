import { describe, it, expect } from "vitest";
import { otherTabWins } from "@/lib/customerTabLock";
import { translate } from "@/lib/i18n";

describe("otherTabWins", () => {
  const a = { tabId: "aaa", at: 100 };
  const b = { tabId: "bbb", at: 200 };

  it("la pestaña más nueva gana (la del reescaneo)", () => {
    expect(otherTabWins(a, b)).toBe(true);
    expect(otherTabWins(b, a)).toBe(false);
  });

  it("no se gana a sí misma", () => {
    expect(otherTabWins(a, a)).toBe(false);
  });
});

describe("copy otra pestaña", () => {
  it("está en es y en", () => {
    expect(translate("es", "cliente.otraPestanaTitulo").length).toBeGreaterThan(8);
    expect(translate("en", "cliente.otraPestanaTitulo").length).toBeGreaterThan(8);
    expect(translate("es", "clienteMesa.otraPestanaSub")).toContain("cerrá");
  });
});

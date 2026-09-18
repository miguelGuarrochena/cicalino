import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { translate } from "@/lib/i18n";
import {
  brandCssVars,
  isCustomerPath,
  parseBrandColor,
  parseLogoUrl,
  BRAND_PRESETS,
  CICALINO_SWATCH,
} from "@/lib/customerBrand";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Identidad del comensal", () => {
  it("null y valores inválidos no cambian el cobalto oficial", () => {
    expect(parseBrandColor(null)).toBeNull();
    expect(parseBrandColor("cobalto")).toBeNull();
    expect(parseBrandColor("negro")).toBe("negro");
    expect(parseBrandColor("blanco")).toBe("blanco");
    expect(parseBrandColor("azul")).toBe("azul");
    expect(brandCssVars(null)).toBeUndefined();
    expect(CICALINO_SWATCH).toBe("#f4f1da");
  });

  it("un color de fondo oscuro aclara texto y botones; no es el dark del panel", () => {
    const vars = brandCssVars("negro");
    expect(vars?.["--bg"]).toBe(BRAND_PRESETS.negro.bg);
    expect(vars?.["--text"]).toBe(BRAND_PRESETS.negro.text);
    expect(vars?.["--brand"]).toBe(BRAND_PRESETS.negro.brand);
    expect(vars?.["--bg"]).not.toBe(vars?.["--text"]);
    expect(JSON.stringify(vars)).not.toMatch(/#10142f|#1a1f45/);
  });

  it("blanco es fondo claro con botones cobalto; azul es la noche Cicalino", () => {
    const blanco = brandCssVars("blanco");
    expect(blanco?.["--bg"]).toBe("#ffffff");
    expect(blanco?.["--brand"]).toBe("#2536d4");
    expect(blanco?.["--text"]).toBe("#20264f");
    const azul = brandCssVars("azul");
    expect(azul?.["--bg"]).toBe("#10142f");
    expect(azul?.["--surface"]).toBe("#1a1f45");
    expect(azul?.["--brand"]).toBe("#7d8bff");
  });

  it("solo acepta data URL de imagen como logo", () => {
    expect(parseLogoUrl("https://cdn.example/logo.png")).toBeNull();
    expect(parseLogoUrl("data:image/png;base64,aaa")).toBe(
      "data:image/png;base64,aaa",
    );
  });

  it("/m /p /e son experiencia del comensal; el panel no", () => {
    expect(isCustomerPath("/m/abc")).toBe(true);
    expect(isCustomerPath("/p/abc")).toBe(true);
    expect(isCustomerPath("/e/abc")).toBe(true);
    expect(isCustomerPath("/panel")).toBe(false);
    expect(isCustomerPath("/")).toBe(false);
  });
});

describe("Copy de identificación de empleado", () => {
  it("el botón y el vacío no hablan de fichar ni de quién atiende", () => {
    expect(translate("es", "fichaje.fichar")).toBe("Identificar empleado");
    expect(translate("es", "fichaje.elegi")).toBe("Identificar empleado");
    expect(translate("es", "fichaje.elegiSub")).toContain("dispositivo");
    expect(translate("es", "card.sinEmp")).toBe("Sin identificar");
    const dict = read("src/lib/i18n.ts");
    expect(dict).not.toContain("Sin fichar");
    expect(dict).not.toContain('"¿Quién atiende?"');
    expect(dict).toContain("¿Quién atiende esta mesa?");
  });
});

describe("Experiencia del comensal: Light fijo + identidad mínima", () => {
  it("theme-init y el layout fuerzan Light sin pisar la preferencia", () => {
    const init = read("public/theme-init.js");
    const layout = read("src/app/(customer)/layout.tsx");
    const providers = read("src/components/providers/Providers.tsx");
    expect(init).toContain("/^\\/[mpe](\\/|$)/");
    expect(init).toContain('setAttribute("data-theme", "light")');
    expect(layout).toContain('root.setAttribute("data-theme", "light")');
    expect(layout).toContain("cicalino-theme");
    expect(providers).toContain("isCustomerPath");
  });

  it("las pantallas /m /p /e no muestran el toggle de tema", () => {
    const files = [
      "src/components/customer/CustomerWaiting.tsx",
      "src/components/customer/CustomerEsperaWaiting.tsx",
      "src/components/customer/CustomerOtherTab.tsx",
      "src/components/customer/table/TableGuestApp.tsx",
      "src/components/customer/table/TableNotFound.tsx",
    ];
    for (const f of files) {
      const src = read(f);
      expect(src, f).toContain("showTheme={false}");
      expect(src, f).not.toMatch(/<Controls(?![^>]*showTheme=\{false\})/);
    }
  });

  it("configuración y migración cubren logo y color", () => {
    const config = read("src/app/(app)/panel/config/page.tsx");
    const card = read("src/components/panel/config/BrandIdentityCard.tsx");
    const sql = read("supabase/locales-identidad.sql");
    const orden = read("supabase/orden.json");
    const chequeo = read("supabase/chequeo-migraciones.sql");
    expect(config).toContain("BrandIdentityCard");
    expect(card).toContain("config.seccionIdentidad");
    expect(card).toContain("config.colorCobalto");
    expect(card).toContain("config.colorBlanco");
    expect(card).toContain("config.colorAzul");
    expect(sql).toContain("'blanco', 'azul'");
    expect(sql).toContain("logo_url");
    expect(sql).toContain("color_marca");
    expect(orden).toContain("locales-identidad.sql");
    expect(chequeo).toContain("locales.logo_url");
  });
});

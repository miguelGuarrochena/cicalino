/**
 * La ayuda del panel y la landing explican las modalidades Mesa y Mostrador
 * QR. Se renderizan de verdad (react-dom/server) en los dos idiomas: ninguna
 * clave queda sin traducir y el contenido dice lo que hace el producto.
 */
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { translate, type Locale } from "@/lib/i18n";

let locale: Locale = "es";
let acceso = { pedidosEnMesa: false, pedidosMostradorQr: false, pedidosTradicional: true };

vi.mock("@/components/providers/Providers", () => ({
  useApp: () => ({
    t: (k: string, v?: Record<string, string | number>) => translate(locale, k, v),
    locale,
  }),
}));
/* Imágenes y links de Next no hacen al contenido: stubs sin DOM. */
vi.mock("@/components/ui/ThemedImg", () => ({ ThemedImg: () => null }));
vi.mock("next/link", async () => {
  const { createElement: h } = await import("react");
  return {
    default: ({ href, children, ...rest }: { href: string; children?: unknown }) =>
      h("a", { href, ...rest }, children as never),
  };
});
vi.mock("@/lib/hooks/useOperationalAccess", () => ({
  useOperationalAccess: () => acceso,
}));

import AyudaPage from "@/app/(app)/panel/ayuda/page";
import { OrderModesSection } from "@/components/landing/OrderModesSection";
import { ModulesOverview } from "@/components/landing/ModulesOverview";
import { FaqContent } from "@/components/faq/FaqContent";

/* El HTML de react-dom escapa comillas y apóstrofos. */
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el)
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const sinClaves = (html: string) =>
  expect(texto(html)).not.toMatch(/\b(ayuda|home|faq|retiroConfig)\.[a-zA-Z]+\.[a-zA-Z.]+/);

describe.each(["es", "en"] as const)("documentación de modalidades (%s)", (l) => {
  it("la ayuda muestra las tres modalidades, la del local y las diferencias", () => {
    locale = l;
    acceso = { pedidosEnMesa: false, pedidosMostradorQr: true, pedidosTradicional: false };
    const html = render(createElement(AyudaPage));
    sinClaves(html);
    const t = (k: string) => translate(l, k);
    /* Pestañas con la terminología de Configuración. */
    for (const k of ["retiroConfig.mostrador", "retiroConfig.mesa", "retiroConfig.mostradorQr"]) {
      expect(html).toContain(t(k));
    }
    /* Arranca en la modalidad de la sucursal: los pasos de Mostrador QR. */
    expect(html).toContain(t("ayuda.pedidos.introQr"));
    expect(html).toContain(t("ayuda.pedidos.q1t"));
    expect(html).toContain(t("ayuda.pedidos.modalidadActual"));
    for (const tip of ["tipQr1", "tipQr2", "tipQr3", "tipQr4"]) {
      expect(html).toContain(t(`ayuda.pedidos.${tip}`));
    }
    /* Las diferencias, siempre. */
    expect(html).toContain(t("ayuda.pedidos.difTitulo"));
    for (const d of ["qr", "pedido", "pago", "preparacion", "listo", "cancelar"]) {
      expect(html).toContain(t(`ayuda.pedidos.dif.${d}.label`));
    }
    /* Las cuatro variantes de material: Mesa y Mostrador QR, con y sin pasos. */
    expect(html).toContain(t("ayuda.pedidos.matTitulo"));
    for (const k of ["mesaMarco", "mesaSolo", "qrMarco", "qrSolo"]) {
      expect(html).toContain(t(`ayuda.pedidos.mat.${k}`));
    }
    expect(html.split(t("mesasQr.descargarMarco")).length - 1).toBeGreaterThanOrEqual(2);
    expect(html.split(t("mesasQr.descargarSolo")).length - 1).toBeGreaterThanOrEqual(2);
  });

  it("un local en Mostrador clásico también puede leer Mesa y Mostrador QR", () => {
    locale = l;
    acceso = { pedidosEnMesa: false, pedidosMostradorQr: false, pedidosTradicional: true };
    const html = render(createElement(AyudaPage));
    sinClaves(html);
    expect(html).toContain(translate(l, "ayuda.pedidos.intro"));
    expect(html).toContain(translate(l, "ayuda.pedidos.difTitulo"));
    expect(html).toContain(translate(l, "retiroConfig.mostradorQr"));
  });

  it("la landing presenta las dos modalidades y el FAQ las responde", () => {
    locale = l;
    const modos = render(createElement(OrderModesSection));
    sinClaves(modos);
    expect(modos).toContain('id="pedidos-desde-el-celular"');
    expect(modos).toContain(translate(l, "home.modos.mesa.etiqueta"));
    expect(modos).toContain(translate(l, "home.modos.qr.etiqueta"));
    expect(modos).toContain(translate(l, "home.modos.mesa.material"));
    expect(modos).toContain(translate(l, "home.modos.qr.material"));

    const tarjetas = render(createElement(ModulesOverview));
    sinClaves(tarjetas);
    expect(tarjetas).toContain('href="#pedidos-desde-el-celular"');

    const faq = render(createElement(FaqContent));
    sinClaves(faq);
    expect(faq).toContain(translate(l, "faq.q8"));
    expect(faq).toContain(translate(l, "faq.q9"));
  });
});

import { BRAND_PRESETS, type BrandColorId } from "@/lib/customerBrand";

/* Copia y medidas del QR informativo (el cartel de mesa).
 *
 * El QR simple vive en otro lado y no usa esto. Acá está lo que comparten
 * el PNG (`qrSticker`) y el papel (`InformativeQrCard`): textos, acento de
 * impresión y el tamaño físico. Si cambia el flujo Pedí / Pagá, cambia acá. */

export const INFORMATIVE_QR_MM = { w: 180, h: 102 } as const;
export const INFORMATIVE_QR_PX = { w: 1680, h: 952 } as const;

export const PRINT_QR_OPTIONS = {
  margin: 2,
  width: 1024,
  errorCorrectionLevel: "H" as const,
  color: { dark: "#000000", light: "#ffffff" },
};

export type InformativeQrCopy = {
  title: string;
  orderLabel: string;
  payLabel: string;
  orderSteps: readonly [string, string, string];
  orderNote: string;
  paySteps: readonly [string, string, string, string];
  payNote: string;
  byline: string;
};

export const informativeQrCopy = (
  t: (key: string) => string,
): InformativeQrCopy => ({
  title: t("mesasQr.cartelTitulo"),
  orderLabel: t("mesasQr.cartelPedi"),
  payLabel: t("mesasQr.cartelPaga"),
  orderSteps: [
    t("mesasQr.cartelPedi1"),
    t("mesasQr.cartelPedi2"),
    t("mesasQr.cartelPedi3"),
  ],
  orderNote: t("mesasQr.cartelPediNota"),
  paySteps: [
    t("mesasQr.cartelPaga1"),
    t("mesasQr.cartelPaga2"),
    t("mesasQr.cartelPaga3"),
    t("mesasQr.cartelPaga4"),
  ],
  payNote: t("mesasQr.cartelPagaNota"),
  byline: t("mesasQr.cartelBy"),
});

/* En papel el acento tiene que ser oscuro sobre blanco. Los presets oscuros
 * del local usan crema como “marca”: acá tomamos el fondo de esa paleta,
 * que sí imprime. Blanco o sin color: el azul de Cicalino, solo como acento. */
export const printAccentFor = (color: BrandColorId | null): string => {
  if (!color || color === "blanco") return "#1b29b0";
  return BRAND_PRESETS[color].bg;
};

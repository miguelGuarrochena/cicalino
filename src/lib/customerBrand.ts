export const BRAND_COLOR_IDS = ["negro", "bordo", "verde", "terracota"] as const;

export type BrandColorId = (typeof BRAND_COLOR_IDS)[number];

export interface CustomerBrand {
  name: string;
  logoUrl: string | null;
  color: BrandColorId | null;
}

export const emptyCustomerBrand = (): CustomerBrand => ({
  name: "",
  logoUrl: null,
  color: null,
});

export const parseBrandColor = (raw: unknown): BrandColorId | null => {
  if (typeof raw !== "string") return null;
  return (BRAND_COLOR_IDS as readonly string[]).includes(raw)
    ? (raw as BrandColorId)
    : null;
};

export const parseLogoUrl = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v.startsWith("data:image/") ? v : null;
};

export const brandFromLocal = (local: {
  nombre?: string | null;
  logo_url?: string | null;
  color_marca?: string | null;
} | null | undefined): CustomerBrand => ({
  name: (local?.nombre ?? "").trim(),
  logoUrl: parseLogoUrl(local?.logo_url),
  color: parseBrandColor(local?.color_marca),
});

/* Cobalto oficial de Cicalino: no se guarda. null deja --brand del CSS. */
export const BRAND_PRESETS: Record<
  BrandColorId,
  { brand: string; strong: string }
> = {
  negro: { brand: "#171717", strong: "#0a0a0a" },
  bordo: { brand: "#7f1d1d", strong: "#5f1515" },
  verde: { brand: "#15803d", strong: "#166534" },
  terracota: { brand: "#c2410c", strong: "#9a3412" },
};

export const COBALT_SWATCH = "#2536d4";

export const brandCssVars = (
  color: BrandColorId | null,
): Record<string, string> | undefined => {
  if (!color) return undefined;
  const p = BRAND_PRESETS[color];
  return {
    "--brand": p.brand,
    "--brand-strong": p.strong,
    "--color-marca": p.brand,
    "--color-marca-fuerte": p.strong,
  };
};

export const isCustomerPath = (path: string): boolean =>
  /^\/[mpe](\/|$)/.test(path);

const LOGO_MAX_PX = 192;
const LOGO_MAX_CHARS = 80_000;

export const compressBrandLogo = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("not-image"));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, LOGO_MAX_PX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const png = canvas.toDataURL("image/png");
      if (png.length <= LOGO_MAX_CHARS) {
        resolve(png);
        return;
      }
      for (const q of [0.82, 0.64, 0.48]) {
        const jpg = canvas.toDataURL("image/jpeg", q);
        if (jpg.length <= LOGO_MAX_CHARS) {
          resolve(jpg);
          return;
        }
      }
      reject(new Error("too-big"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load"));
    };
    img.src = url;
  });

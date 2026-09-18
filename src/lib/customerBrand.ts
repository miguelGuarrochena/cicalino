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

/* Paleta del comensal: el color pinta el FONDO. Textos y botones contrastan.
 * `bg-marca text-crema` = botón en `brand` con texto en `bg`.
 * null = crema + cobalto oficial. No es el Light/Dark del panel. */
export const BRAND_PRESETS: Record<
  BrandColorId,
  {
    bg: string;
    surface: string;
    text: string;
    brand: string;
    strong: string;
    line: string;
    scheme: "light" | "dark";
  }
> = {
  negro: {
    bg: "#171717",
    surface: "#242424",
    text: "#f4efe0",
    brand: "#f4efe0",
    strong: "#ffffff",
    line: "#3a3a3a",
    scheme: "dark",
  },
  bordo: {
    bg: "#7f1d1d",
    surface: "#8f2a2a",
    text: "#faf4ea",
    brand: "#faf4ea",
    strong: "#ffffff",
    line: "#a34a4a",
    scheme: "dark",
  },
  verde: {
    bg: "#15803d",
    surface: "#1a9148",
    text: "#f4faf6",
    brand: "#f4faf6",
    strong: "#ffffff",
    line: "#4ade80",
    scheme: "dark",
  },
  terracota: {
    bg: "#c2410c",
    surface: "#d14e16",
    text: "#fff7ed",
    brand: "#fff7ed",
    strong: "#ffffff",
    line: "#fdba74",
    scheme: "dark",
  },
};

export const CICALINO_SWATCH = "#f4f1da";

export const brandColorScheme = (
  color: BrandColorId | null,
): "light" | "dark" => (color ? BRAND_PRESETS[color].scheme : "light");

export const brandCssVars = (
  color: BrandColorId | null,
): Record<string, string> | undefined => {
  if (!color) return undefined;
  const p = BRAND_PRESETS[color];
  return {
    "--bg": p.bg,
    "--surface": p.surface,
    "--text": p.text,
    "--brand": p.brand,
    "--brand-strong": p.strong,
    "--line": p.line,
    "--color-crema": p.bg,
    "--color-surface": p.surface,
    "--color-carbon": p.text,
    "--color-marca": p.brand,
    "--color-marca-fuerte": p.strong,
    "--color-linea": p.line,
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

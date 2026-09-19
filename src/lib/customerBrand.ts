export const BRAND_COLOR_IDS = [
  "blanco",
  "azul",
  "negro",
  "bordo",
  "verde",
  "terracota",
] as const;

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

/* Paleta del comensal: el color pinta el FONDO. Textos, botones e
 * ilustraciones contrastan. `bg-marca text-crema` = botón en `brand` con
 * texto en `bg`. null = crema + cobalto oficial. No es el Light/Dark del
 * panel: scheme marca si la mascota va azul o crema.
 *
 * Cada preset se mide contra su propio `surface`, que es donde viven las
 * tarjetas: el nombre del plato, el precio y la descripción se leen ahí, no
 * sobre el fondo. Verde y terracota estaban claros de más y el nombre del
 * plato daba 3.83 y 4.11 — abajo de AA con el texto principal, no con el
 * secundario. Ahora son el tono 800/900 de su familia y dan 6.81 y 7.66.
 *
 * `soft` es el secundario de ese preset: la mezcla de `text` al 74% sobre
 * `surface`. El 74% sale del peor caso (verde) y se aplica igual en todos para
 * que el salto entre principal y secundario se vea parejo en toda la paleta. */
export const BRAND_PRESETS: Record<
  BrandColorId,
  {
    bg: string;
    surface: string;
    text: string;
    /* Texto secundario, ya medido: >= 4.5:1 sobre `surface` y sobre `bg`. */
    soft: string;
    brand: string;
    strong: string;
    line: string;
    scheme: "light" | "dark";
  }
> = {
  blanco: {
    bg: "#ffffff",
    surface: "#f7f7f5",
    text: "#20264f",
    soft: "#585c7a",
    brand: "#2536d4",
    strong: "#1b29b0",
    line: "#e8e8e4",
    scheme: "light",
  },
  azul: {
    bg: "#10142f",
    surface: "#1a1f45",
    text: "#ede9ce",
    soft: "#b6b4aa",
    brand: "#7d8bff",
    strong: "#9aa4ff",
    line: "#2a2f5c",
    scheme: "dark",
  },
  negro: {
    bg: "#171717",
    surface: "#242424",
    text: "#f4efe0",
    soft: "#bebaaf",
    brand: "#f4efe0",
    strong: "#ffffff",
    line: "#3a3a3a",
    scheme: "dark",
  },
  bordo: {
    bg: "#7f1d1d",
    surface: "#8f2a2a",
    text: "#faf4ea",
    soft: "#debfb8",
    brand: "#faf4ea",
    strong: "#ffffff",
    line: "#a34a4a",
    scheme: "dark",
  },
  verde: {
    bg: "#14532d",
    surface: "#166534",
    text: "#f0fdf4",
    soft: "#b7d5c2",
    brand: "#f0fdf4",
    strong: "#ffffff",
    line: "#3f8f5f",
    scheme: "dark",
  },
  terracota: {
    bg: "#7c2d12",
    surface: "#8a3414",
    text: "#fff7ed",
    soft: "#e1c4b5",
    brand: "#fff7ed",
    strong: "#ffffff",
    line: "#b5623a",
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
    "--suave": p.soft,
    "--brand": p.brand,
    "--brand-strong": p.strong,
    "--line": p.line,
    /* El número de espera se pintaba con `--espera`, el teal del módulo, que
     * no estaba acá: quedaba #0f766e sobre el fondo del local. Sobre verde
     * daba 1.09:1 y sobre terracota 1.06:1 — el mismo color, en la práctica,
     * y esa pantalla existe para mostrar ese número. En un local con marca
     * propia el teal pasa a ser el color del local, que ya está medido. */
    "--espera": p.brand,
    "--espera-strong": p.strong,
    "--color-crema": p.bg,
    "--color-surface": p.surface,
    "--color-carbon": p.text,
    "--color-suave": p.soft,
    "--color-marca": p.brand,
    "--color-marca-fuerte": p.strong,
    "--color-espera": p.brand,
    "--color-espera-fuerte": p.strong,
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

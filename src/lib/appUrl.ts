import "server-only";

const FALLBACK = "https://cicalino.net";

/**
 * URL pública de la app (sin slash final).
 * Tolera espacios / basura accidental en NEXT_PUBLIC_APP_URL de Vercel.
 */
export const appBaseUrl = (): string => {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (!raw || raw.includes("localhost")) return FALLBACK;
  try {
    // Solo el origin: descarta path/basura tipo "https://cicalino.net (/admin".
    const u = new URL(raw.split(/\s/)[0] ?? raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return FALLBACK;
    return u.origin;
  } catch {
    return FALLBACK;
  }
};

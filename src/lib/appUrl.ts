const FALLBACK = "https://cicalino.net";

/**
 * URL pública de la app (sin slash final).
 * Tolera espacios / basura accidental en NEXT_PUBLIC_APP_URL de Vercel.
 */
export const appBaseUrl = (): string => {
  const rawCandidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "",
  ];

  for (const raw of rawCandidates) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed || trimmed.includes("localhost")) continue;
    try {
      const u = new URL(trimmed.split(/\s/)[0] ?? trimmed);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      // Preferir el dominio propio para assets de mail (evita preview rotos).
      if (u.hostname.endsWith("vercel.app") && rawCandidates[0]) {
        // seguir buscando; si no hay mejor, lo usamos abajo
        continue;
      }
      return u.origin;
    } catch {
      /* next */
    }
  }

  // Si solo había vercel.app, usarlo; si nada, cicalino.net.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel && !vercel.includes("localhost")) {
    try {
      return new URL(
        vercel.startsWith("http") ? vercel : `https://${vercel}`,
      ).origin;
    } catch {
      /* fallthrough */
    }
  }
  return FALLBACK;
};

/** URL absoluta de un asset público (mails, OG, etc.). */
export const assetUrl = (path: string): string => {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${appBaseUrl()}${p}`;
};

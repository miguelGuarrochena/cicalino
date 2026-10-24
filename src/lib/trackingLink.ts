/* Copiar y compartir el link de un pedido (TrackingLink), sin React para
 * poder probarlo. Cada función dice qué pasó, y "manual" significa que el
 * navegador no dejó: la pantalla muestra el link para copiarlo a mano. */

export type LinkFeedback = "copiado" | "compartido" | "manual";

type ClipboardLike = { writeText: (text: string) => Promise<void> } | undefined;
type ShareLike = ((data: ShareData) => Promise<void>) | undefined;

export const copyTrackingLink = async (
  url: string,
  clipboard: ClipboardLike,
): Promise<LinkFeedback> => {
  if (!clipboard) return "manual";
  try {
    await clipboard.writeText(url);
    return "copiado";
  } catch {
    /* Sin permiso de portapapeles o sin contexto seguro. */
    return "manual";
  }
};

/* null: el cliente cerró la hoja de compartir. No es un error ni un éxito. */
export const shareTrackingLink = async (
  data: ShareData,
  share: ShareLike,
): Promise<LinkFeedback | null> => {
  if (!share) return "manual";
  try {
    await share(data);
    return "compartido";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return null;
    return "manual";
  }
};

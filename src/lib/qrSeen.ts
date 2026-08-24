/* El panel cierra el QR si `visto_en` es *más nuevo* que al abrir el modal.
 *
 * Comparar strings falla cuando el listado y el fetch traen el mismo instante
 * con distinto formato. “Distinto” también cerraba Ver QR si el cliente
 * seguía en la pestaña: el DB ya había avanzado y el snapshot de la tarjeta no.
 */
export const seenAtNewer = (
  next: string | null | undefined,
  prev: string | null | undefined,
): boolean => {
  if (!next) return false;
  if (!prev) return true;
  const n = Date.parse(next);
  const p = Date.parse(prev);
  if (Number.isNaN(n) || Number.isNaN(p)) return next !== prev;
  return n > p;
};

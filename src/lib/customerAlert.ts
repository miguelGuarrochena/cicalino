/**
 * Cuándo la pestaña del cliente tiene que volver a animar / vibrar.
 *
 * El primer aviso es el salto de estado (esperando → avisado, en curso → listo).
 * "Volver a avisar" no cambia el estado: solo pisa avisado_en y manda el push.
 * Si la clave fuera solo el status, el reaviso llega al celular y la pestaña
 * no se mueve.
 *
 * El panel escribe avisado_en al marcar listo/avisado y /api/push/notify lo
 * vuelve a pisar. Un poll entre esas dos escrituras no tiene que sonar otra
 * vez: por eso absorbemos cambios de stamp muy juntos.
 */

export const CUSTOMER_REAVISO_MIN_MS = 10_000;

export const customerAlertKey = (
  status: string,
  notifiedAt: string | null,
): string => `${status}:${notifiedAt ?? ""}`;

const parseStamp = (iso: string): number | null => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/** ¿Es el segundo stamp del mismo aviso (notify pisa avisado_en) o un reaviso? */
export const isNotifyStampRace = (
  prevKey: string,
  status: string,
  notifiedAt: string | null,
  minMs: number = CUSTOMER_REAVISO_MIN_MS,
): boolean => {
  const sep = prevKey.indexOf(":");
  const prevStatus = sep >= 0 ? prevKey.slice(0, sep) : prevKey;
  const prevNotified = sep >= 0 ? prevKey.slice(sep + 1) : "";
  if (prevStatus !== status || !prevNotified || !notifiedAt) return false;
  const prevT = parseStamp(prevNotified);
  const nextT = parseStamp(notifiedAt);
  if (prevT == null || nextT == null) return false;
  const delta = nextT - prevT;
  return delta >= 0 && delta < minMs;
};

export const shouldFireCustomerAlert = (opts: {
  prevKey: string | null;
  status: string;
  notifiedAt: string | null;
}): { fire: boolean; key: string } => {
  const key = customerAlertKey(opts.status, opts.notifiedAt);
  if (opts.prevKey === null) return { fire: true, key };
  if (opts.prevKey === key) return { fire: false, key };
  if (isNotifyStampRace(opts.prevKey, opts.status, opts.notifiedAt)) {
    return { fire: false, key };
  }
  return { fire: true, key };
};

/** Push del SW con la pestaña ya en listo/avisado: es un "volver a avisar". */
export const shouldReplayFromPush = (opts: {
  alreadyAlerted: boolean;
  lastFiredAt: number | null;
  now?: number;
  minMs?: number;
}): boolean => {
  if (!opts.alreadyAlerted) return false;
  const now = opts.now ?? Date.now();
  const minMs = opts.minMs ?? CUSTOMER_REAVISO_MIN_MS;
  if (opts.lastFiredAt == null) return true;
  return now - opts.lastFiredAt >= minMs;
};

import { randomBytes } from "node:crypto";

export const generarQrToken = (): string => {
  return randomBytes(16).toString("base64url");
};

export const finDelDiaArgentina = (desde: Date = new Date()): Date => {
  // Argentina no aplica horario de verano: offset fijo UTC-3.
  const offsetMs = -3 * 60 * 60 * 1000;
  const local = new Date(desde.getTime() + offsetMs);
  local.setUTCHours(23, 59, 59, 999);
  return new Date(local.getTime() - offsetMs);
};

export const tokenVigente = (expiraEn: Date, ahora: Date = new Date()): boolean => {
  return ahora.getTime() <= expiraEn.getTime();
};

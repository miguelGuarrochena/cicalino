/** Último pedido o espera abierto en este teléfono (mismo navegador). */

export const LAST_VISIT_KEY = "cicalino-ultimo-seguimiento";
export const LAST_VISIT_MAX_MS = 18 * 60 * 60 * 1000;

export type LastVisit = {
  kind: "p" | "e";
  token: string;
  label: string;
  alias?: string | null;
  savedAt: number;
};

const isKind = (v: unknown): v is LastVisit["kind"] => v === "p" || v === "e";

export const parseLastVisit = (
  raw: string | null,
  now = Date.now(),
): LastVisit | null => {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<LastVisit>;
    if (!isKind(data.kind)) return null;
    if (typeof data.token !== "string" || data.token.length < 8) return null;
    if (typeof data.label !== "string" || !data.label.trim()) return null;
    if (typeof data.savedAt !== "number" || now - data.savedAt > LAST_VISIT_MAX_MS) {
      return null;
    }
    const alias =
      typeof data.alias === "string" && data.alias.trim()
        ? data.alias.trim()
        : null;
    return {
      kind: data.kind,
      token: data.token,
      label: data.label.trim().slice(0, 40),
      alias,
      savedAt: data.savedAt,
    };
  } catch {
    return null;
  }
};

const storage = (): Storage | null => {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
};

export const readLastVisit = (): LastVisit | null => {
  const s = storage();
  if (!s) return null;
  const visit = parseLastVisit(s.getItem(LAST_VISIT_KEY));
  if (!visit) {
    try {
      s.removeItem(LAST_VISIT_KEY);
    } catch {
      /* ignore */
    }
  }
  return visit;
};

export const saveLastVisit = (
  visit: Omit<LastVisit, "savedAt">,
  now = Date.now(),
): void => {
  const s = storage();
  if (!s) return;
  const payload: LastVisit = {
    kind: visit.kind,
    token: visit.token,
    label: visit.label.trim().slice(0, 40),
    alias: visit.alias?.trim() || null,
    savedAt: now,
  };
  try {
    s.setItem(LAST_VISIT_KEY, JSON.stringify(payload));
  } catch {
    /* quota / modo privado */
  }
};

export const clearLastVisit = (): void => {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(LAST_VISIT_KEY);
  } catch {
    /* ignore */
  }
};

export const clearLastVisitIfToken = (token: string): void => {
  const actual = readLastVisit();
  if (actual?.token === token) clearLastVisit();
};

/** El seguimiento guardado solo vale mientras ese pedido/espera sigue abierto.
 * Si ya lo retiraron o es un QR nuevo, no hay que reabrir el viejo. */
export const lastVisitStillOpen = (
  kind: LastVisit["kind"],
  status: string | undefined,
): boolean => {
  if (!status) return false;
  if (kind === "p") {
    return (
      status === "creado" ||
      status === "en_preparacion" ||
      status === "listo"
    );
  }
  return status === "esperando" || status === "avisado";
};

export const shouldShowLastVisit = (args: {
  kind: LastVisit["kind"];
  ok: boolean;
  reason?: string;
  status?: string;
}): boolean => {
  /* Demo local / rate limit: no sabemos; no borramos el atajo. */
  if (args.reason === "not-configured" || args.reason === "rate-limited") {
    return true;
  }
  if (!args.ok) return false;
  return lastVisitStillOpen(args.kind, args.status);
};

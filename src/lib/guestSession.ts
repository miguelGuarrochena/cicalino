/* Guest identity on the diner phone.
 *
 * Joining sets an httpOnly cookie. Camera browsers (and some WebViews) drop
 * it when the tab closes, so the same value is also kept in localStorage.
 * Restore only works while that table's session is still `abierta`. */

export const GUEST_COOKIE = "cicalino_comensal";

export const guestStorageKey = (token: string) => `cicalino_mesa:${token}`;

export const saveGuestCred = (token: string, cred: string) => {
  try {
    localStorage.setItem(guestStorageKey(token), cred);
  } catch {
    /* Private mode / quota: cookie-only restore still applies. */
  }
};

export const loadGuestCred = (token: string): string | null => {
  try {
    return localStorage.getItem(guestStorageKey(token));
  } catch {
    return null;
  }
};

export const clearGuestCred = (token: string) => {
  try {
    localStorage.removeItem(guestStorageKey(token));
  } catch {
    /* ignore */
  }
};

export const guestSessionHere = (
  session: { status: string; tableId: string | null } | null | undefined,
  tableId: string,
): boolean =>
  !!session && session.status === "abierta" && !!tableId && session.tableId === tableId;

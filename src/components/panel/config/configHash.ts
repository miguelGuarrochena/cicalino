/* Hash of Configuración: Next.js Link no dispara hashchange en la misma
 * página, así que el acordeón no se enteraba. Abrimos y scrolleamos a mano. */

export const readConfigSection = (): string => {
  if (typeof window === "undefined") return "";
  return window.location.hash.replace(/^#/, "");
};

export const goToConfigSection = (
  id: string,
  mode: "push" | "replace" = "push",
) => {
  if (typeof window === "undefined") return;
  const path = `${window.location.pathname}${window.location.search}`;
  const next = id ? `${path}#${id}` : path;
  const current = `${path}${window.location.hash}`;
  if (next !== current) {
    if (mode === "replace") window.history.replaceState(null, "", next);
    else window.history.pushState(null, "", next);
  }
  window.dispatchEvent(new HashChangeEvent("hashchange"));
};

export const subscribeConfigSection = (fn: () => void) => {
  window.addEventListener("hashchange", fn);
  window.addEventListener("popstate", fn);
  return () => {
    window.removeEventListener("hashchange", fn);
    window.removeEventListener("popstate", fn);
  };
};

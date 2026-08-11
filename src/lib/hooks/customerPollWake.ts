/** Helpers compartidos para el polling de pantallas QR del cliente. */

export const CUSTOMER_SW_REFRESH = "cicalino-refresh";

/** ¿La pestaña está visible y debería consultar de nuevo? */
export const tabVisible = (): boolean =>
  typeof document !== "undefined" && document.visibilityState === "visible";

/**
 * Adjunta wake handlers (visibility/focus/online/pageshow + mensaje del SW)
 * para retomar el poll cuando el cliente vuelve a la app.
 */
export const attachCustomerWake = (onWake: () => void): (() => void) => {
  const onVisibility = () => {
    if (tabVisible()) onWake();
  };

  const onPageShow = () => {
    if (tabVisible()) onWake();
  };

  const onMessage = (ev: MessageEvent) => {
    if (ev.data?.type === CUSTOMER_SW_REFRESH) onWake();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onWake);
  window.addEventListener("online", onWake);
  window.addEventListener("pageshow", onPageShow);
  navigator.serviceWorker?.addEventListener("message", onMessage);

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onWake);
    window.removeEventListener("online", onWake);
    window.removeEventListener("pageshow", onPageShow);
    navigator.serviceWorker?.removeEventListener("message", onMessage);
  };
};

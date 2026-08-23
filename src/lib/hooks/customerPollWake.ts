/** Helpers compartidos para el polling de pantallas QR del cliente. */

export const CUSTOMER_SW_REFRESH = "cicalino-refresh";

/* 10 s: por encima de un round-trip lento (3G) y del intervalo más largo
 * (8 s en "creado"); muy por debajo del default del browser (minutos) y del
 * tope de backoff (30 s). Un TCP colgado no deja inFlight=true para siempre. */
export const CUSTOMER_POLL_TIMEOUT_MS = 10_000;

export type CustomerPollAbort = {
  signal: AbortSignal;
  abort: () => void;
};

/**
 * Señal de un GET del poll: timeout + abort al desmontar / cambiar de token.
 *
 * `AbortSignal.timeout` (Safari 16+, Chrome 103+, Node 20) marca el corte.
 * Lo envolvemos en un AbortController propio porque el timeout no se puede
 * cancelar y el unmount tiene que abortar ya, no en 10 s. Si `timeout` no
 * existe (Safari 15), caemos a un timer equivalente.
 */
export const createCustomerPollAbort = (
  timeoutMs: number = CUSTOMER_POLL_TIMEOUT_MS,
): CustomerPollAbort => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timeoutSignal: AbortSignal | undefined;

  const onTimeout = () => {
    timeoutId = undefined;
    if (!controller.signal.aborted) controller.abort();
  };

  const abort = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    if (timeoutSignal) {
      timeoutSignal.removeEventListener("abort", onTimeout);
      timeoutSignal = undefined;
    }
    if (!controller.signal.aborted) controller.abort();
  };

  if (typeof AbortSignal.timeout === "function") {
    timeoutSignal = AbortSignal.timeout(timeoutMs);
    if (timeoutSignal.aborted) onTimeout();
    else timeoutSignal.addEventListener("abort", onTimeout, { once: true });
  } else {
    timeoutId = setTimeout(onTimeout, timeoutMs);
  }

  return { signal: controller.signal, abort };
};

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

/**
 * Diálogo nativo al cerrar/recargar. Los browsers ignoran el texto custom y
 * en iPhone al matar la pestaña a menudo no aparece: el aviso en pantalla
 * es la red de verdad.
 */
export const attachLeaveGuard = (): (() => void) => {
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = "";
  };
  window.addEventListener("beforeunload", onBeforeUnload);
  return () => window.removeEventListener("beforeunload", onBeforeUnload);
};

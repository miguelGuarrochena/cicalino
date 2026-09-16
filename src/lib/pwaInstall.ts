/**
 * Instalación de la PWA: detección y memoria del "más tarde".
 *
 * Vive fuera del componente porque son decisiones con casos borde —el reloj
 * del equipo, un storage bloqueado, un navegador que no avisa nada— y así se
 * pueden probar sin montar React.
 */

export const INSTALL_DISMISS_KEY = "cicalino-install-descartado";

/** Una semana. Descartar el aviso no es "nunca más": es "ahora no". */
export const INSTALL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/* En iOS no hay evento de instalación, así que el aviso aparece solo por
 * tiempo. Un par de segundos para que el usuario vea primero la pantalla que
 * vino a ver y el cartel no le salte encima al abrir. */
export const INSTALL_IOS_DELAY_MS = 2_000;

/**
 * ¿Sigue vigente el descarte?
 *
 * Recibe lo crudo del storage: ahí puede haber cualquier cosa (lo escribió una
 * versión vieja, lo tocó alguien a mano) y un `Number("abc")` silencioso
 * dejaría el aviso escondido para siempre.
 *
 * Si el sello quedó en el futuro —el equipo del mostrador con la fecha
 * corrida, que pasa— lo tratamos como vigente. Entre volver a mostrar el
 * cartel en cada carga y esperar de más, molesta menos lo segundo.
 */
export const dismissVigente = (
  raw: string | null,
  ahora: number = Date.now(),
  cooldown: number = INSTALL_COOLDOWN_MS,
): boolean => {
  if (!raw) return false;
  const sello = Number(raw);
  if (!Number.isFinite(sello)) return false;
  const delta = ahora - sello;
  if (delta < 0) return true;
  return delta < cooldown;
};

/** ¿Ya está instalada y corriendo como app (no como pestaña)? */
export const enStandalone = (): boolean => {
  if (typeof window === "undefined") return false;
  const iosApp = (window.navigator as Navigator & { standalone?: boolean })
    .standalone;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    iosApp === true
  );
};

/**
 * Safari en iOS, el único caso donde hay que explicar los pasos a mano.
 *
 * Chrome y Firefox en iPhone son el mismo WebKit por abajo, pero no pueden
 * agregar a la pantalla de inicio: mostrarles las instrucciones de Safari
 * sería mandarlos a buscar un botón que no está.
 */
export const enIOSSafari = (): boolean => {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/.test(ua) ||
    /* El iPad se presenta como Mac desde iPadOS 13; el touch lo delata. */
    (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return ios && safari;
};

export const dismissActivo = (ahora: number = Date.now()): boolean => {
  try {
    return dismissVigente(localStorage.getItem(INSTALL_DISMISS_KEY), ahora);
  } catch {
    /* Storage bloqueado (modo privado, cookies de terceros): sin memoria del
     * descarte. Preferimos mostrar el aviso a romper la pantalla. */
    return false;
  }
};

export const marcarDismiss = (ahora: number = Date.now()): void => {
  try {
    localStorage.setItem(INSTALL_DISMISS_KEY, String(ahora));
  } catch {
    /* Sin storage el "más tarde" dura lo que dure la pestaña. */
  }
};

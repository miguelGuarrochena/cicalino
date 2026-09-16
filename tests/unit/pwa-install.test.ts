import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  INSTALL_COOLDOWN_MS,
  INSTALL_DISMISS_KEY,
  dismissActivo,
  dismissVigente,
  enIOSSafari,
  enStandalone,
  marcarDismiss,
} from "@/lib/pwaInstall";

const AHORA = Date.parse("2026-09-04T12:00:00.000Z");

describe("dismissVigente", () => {
  it("sin sello guardado el aviso se muestra", () => {
    expect(dismissVigente(null, AHORA)).toBe(false);
  });

  it("dentro de la semana sigue descartado", () => {
    const hace2dias = String(AHORA - 2 * 24 * 60 * 60 * 1000);
    expect(dismissVigente(hace2dias, AHORA)).toBe(true);
  });

  it("pasada la semana vuelve a aparecer", () => {
    const viejo = String(AHORA - INSTALL_COOLDOWN_MS - 1);
    expect(dismissVigente(viejo, AHORA)).toBe(false);
  });

  it("justo en el límite ya no cuenta como descartado", () => {
    expect(dismissVigente(String(AHORA - INSTALL_COOLDOWN_MS), AHORA)).toBe(
      false,
    );
  });

  it("un sello ilegible no esconde el aviso para siempre", () => {
    expect(dismissVigente("ayer", AHORA)).toBe(false);
    expect(dismissVigente("", AHORA)).toBe(false);
  });

  it("con la fecha del equipo corrida hacia atrás no reaparece en cada carga", () => {
    const futuro = String(AHORA + 30 * 24 * 60 * 60 * 1000);
    expect(dismissVigente(futuro, AHORA)).toBe(true);
  });
});

describe("dismissActivo / marcarDismiss", () => {
  beforeEach(() => localStorage.clear());

  it("descartar el aviso lo silencia y la semana siguiente lo devuelve", () => {
    expect(dismissActivo(AHORA)).toBe(false);
    marcarDismiss(AHORA);
    expect(localStorage.getItem(INSTALL_DISMISS_KEY)).toBe(String(AHORA));
    expect(dismissActivo(AHORA + 60_000)).toBe(true);
    expect(dismissActivo(AHORA + INSTALL_COOLDOWN_MS + 1)).toBe(false);
  });
});

/* `window` en los tests es el global de Node (ver tests/setup.ts): le
 * colgamos lo justo que mira cada detección. */
type WinParcheable = {
  matchMedia?: (q: string) => { matches: boolean };
  navigator?: unknown;
};

const parchear = (parche: WinParcheable) => {
  /* `navigator` en Node es un getter del global, así que no se puede pisar
   * con una asignación: hay que redefinir la propiedad y devolver el
   * descriptor original al terminar. */
  const w = globalThis.window as unknown as Record<string, unknown>;
  const antes = Object.entries(parche).map(
    ([k]) => [k, Object.getOwnPropertyDescriptor(w, k)] as const,
  );
  for (const [k, v] of Object.entries(parche)) {
    Object.defineProperty(w, k, { value: v, configurable: true, writable: true });
  }
  return () => {
    for (const [k, desc] of antes) {
      if (desc) Object.defineProperty(w, k, desc);
      else delete w[k];
    }
  };
};

describe("enStandalone", () => {
  let restaurar = () => {};
  afterEach(() => restaurar());

  it("detecta la app abierta como PWA", () => {
    restaurar = parchear({
      matchMedia: (q) => ({ matches: q.includes("standalone") }),
      navigator: { userAgent: "Chrome" },
    });
    expect(enStandalone()).toBe(true);
  });

  it("en una pestaña común devuelve false", () => {
    restaurar = parchear({
      matchMedia: () => ({ matches: false }),
      navigator: { userAgent: "Chrome" },
    });
    expect(enStandalone()).toBe(false);
  });

  it("en iOS alcanza con navigator.standalone", () => {
    restaurar = parchear({
      matchMedia: () => ({ matches: false }),
      navigator: { userAgent: "iPhone Safari", standalone: true },
    });
    expect(enStandalone()).toBe(true);
  });

  it("no explota si el navegador no trae matchMedia", () => {
    restaurar = parchear({
      matchMedia: undefined,
      navigator: { userAgent: "raro" },
    });
    expect(enStandalone()).toBe(false);
  });
});

describe("enIOSSafari", () => {
  let restaurar = () => {};
  afterEach(() => restaurar());

  const conUA = (userAgent: string, maxTouchPoints = 0) =>
    parchear({
      matchMedia: () => ({ matches: false }),
      navigator: { userAgent, maxTouchPoints },
    });

  it("reconoce Safari en iPhone", () => {
    restaurar = conUA(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    expect(enIOSSafari()).toBe(true);
  });

  it("reconoce el iPad, que se hace pasar por Mac", () => {
    restaurar = conUA(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      5,
    );
    expect(enIOSSafari()).toBe(true);
  });

  it("no manda a Chrome en iPhone a buscar un botón que no tiene", () => {
    restaurar = conUA(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1",
    );
    expect(enIOSSafari()).toBe(false);
  });

  it("Safari de escritorio no es iOS", () => {
    restaurar = conUA(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    );
    expect(enIOSSafari()).toBe(false);
  });

  it("Chrome de escritorio tampoco", () => {
    restaurar = conUA(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    );
    expect(enIOSSafari()).toBe(false);
  });
});

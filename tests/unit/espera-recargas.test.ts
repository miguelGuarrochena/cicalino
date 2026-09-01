import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coalesced } from "@/lib/realtime";

const root = process.cwd();
const hook = readFileSync(join(root, "src/lib/hooks/useWaitlist.ts"), "utf8");

/* Cada recarga de la sala son tres consultas (esperas, mesas y reservas) y el
 * hook la dispara desde trece lugares. El problema medible no era la
 * frecuencia del polling sino el rebote: la acción recarga, y el realtime
 * avisa del cambio que esa misma acción acaba de hacer, y recarga de nuevo. */
const CONSULTAS_POR_RECARGA = 3;

/* Un reload de mentira que tarda, para poder solapar llamadas. */
const recargaLenta = (ms = 20) => {
  let corridas = 0;
  const fn = async () => {
    corridas++;
    await new Promise((r) => setTimeout(r, ms));
  };
  return { fn, corridas: () => corridas };
};

describe("Recargas de la sala: antes y después", () => {
  it("sin unir, una acción con su rebote de realtime son dos recargas", async () => {
    const { fn, corridas } = recargaLenta();
    /* Así estaba: cada llamada arranca su propia recarga. */
    await Promise.all([fn(), fn()]);
    expect(corridas()).toBe(2);
    expect(corridas() * CONSULTAS_POR_RECARGA).toBe(6);
  });

  it("unidas, la misma acción con su rebote son dos pasadas… de una sola en vuelo", async () => {
    const { fn, corridas } = recargaLenta();
    const reload = coalesced(fn);
    /* La segunda llega mientras la primera está en vuelo. */
    const a = reload();
    const b = reload();
    expect(a).toBe(b);
    await a;
    /* Una pasada por la acción y una por lo que llegó durante: nada se pierde,
     * pero no hay tres consultas al pedo corriendo en paralelo. */
    expect(corridas()).toBe(2);
  });

  it("una ráfaga de cinco colapsa a dos pasadas", async () => {
    const { fn, corridas } = recargaLenta();
    const reload = coalesced(fn);
    const p = reload();
    reload();
    reload();
    reload();
    reload();
    await p;
    expect(corridas()).toBe(2);
    /* 15 consultas → 6. */
    expect(corridas() * CONSULTAS_POR_RECARGA).toBe(6);
  });

  it("no pierde el cambio de otro usuario que llega durante la recarga", async () => {
    /* El caso multiusuario: mientras yo recargo, otro mozo sienta un grupo y
     * el realtime avisa. Ese aviso tiene que provocar otra pasada, si no me
     * quedo con la sala vieja hasta el próximo tick. */
    const vistos: number[] = [];
    let estadoServidor = 1;
    const reload = coalesced(async () => {
      /* La consulta sale con lo que hay en el servidor cuando arranca, no
       * cuando vuelve: por eso el snapshot se toma antes del await. */
      const snapshot = estadoServidor;
      await new Promise((r) => setTimeout(r, 10));
      vistos.push(snapshot);
    });

    const p = reload();
    estadoServidor = 2; // otro mozo cambió algo
    reload(); // realtime avisa
    await p;

    expect(vistos).toEqual([1, 2]);
    /* Lo importante: la última pasada vio el estado nuevo. */
    expect(vistos.at(-1)).toBe(2);
  });

  it("después de terminar, una llamada nueva vuelve a recargar", async () => {
    const { fn, corridas } = recargaLenta(1);
    const reload = coalesced(fn);
    await reload();
    expect(corridas()).toBe(1);
    await reload();
    expect(corridas()).toBe(2);
  });

  it("si la recarga falla, la próxima no queda trabada", async () => {
    let n = 0;
    const reload = coalesced(async () => {
      n++;
      if (n === 1) throw new Error("red caída");
    });
    await expect(reload()).rejects.toThrow("red caída");
    await reload();
    expect(n).toBe(2);
  });
});

describe("useWaitlist usa la versión unida", () => {
  it("el reload que consume la pantalla pasa por coalesced", () => {
    expect(hook).toContain("coalesced(recargar)");
    expect(hook).toMatch(/const reload = useMemo\(\(\) => coalesced\(recargar\)/);
  });

  it("las mutaciones siguen esperando el reload, no lo saltean", () => {
    /* Colapsar no puede significar devolver antes de tiempo: el que espera
     * recibe la promesa en vuelo, que termina después de la última pasada. */
    expect(hook.match(/await reload\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(
      10,
    );
  });

  it("sigue habiendo una sola suscripción y un solo intervalo", () => {
    expect(hook).toContain("attachLiveRefresh");
    expect(hook).toContain("ticksSano: 4");
  });
});

describe("attachLiveRefresh conserva el comportamiento de cada módulo", () => {
  const orders = readFileSync(join(root, "src/lib/hooks/useOrders.ts"), "utf8");
  const realtime = readFileSync(join(root, "src/lib/realtime.ts"), "utf8");

  it("pedidos refresca cada 6 ticks y sala cada 4, como antes", () => {
    expect(orders).toContain("ticksSano: 6");
    expect(hook).toContain("ticksSano: 4");
  });

  it("mantiene los tres despertadores y el piso de 5 s", () => {
    expect(realtime).toContain('"visibilitychange"');
    expect(realtime).toContain('"focus"');
    expect(realtime).toContain('"online"');
    expect(realtime).toMatch(/cadaMs = 5_000/);
  });

  it("con la suscripción caída refresca cada tick", () => {
    expect(realtime).toMatch(/sub\.isHealthy\(\) \? ticksSano : 1/);
  });

  it("no refresca con la pestaña oculta", () => {
    expect(realtime).toMatch(
      /document\.visibilityState !== "visible"\) return;/,
    );
  });
});

/* attachLiveRefresh se cuelga de document/window. El entorno de los tests es
 * node, así que se les pone lo mínimo —addEventListener y visibilityState— y
 * se saca al terminar, para no dejar globales puestos al resto de la suite. */
const conDom = async (fn: () => Promise<void> | void) => {
  const g = globalThis as Record<string, unknown>;
  const habia = "document" in g;
  const noop = () => {};
  g.document = { addEventListener: noop, removeEventListener: noop, visibilityState: "visible" };
  const winHabia = typeof (g.window as { addEventListener?: unknown })?.addEventListener;
  if (winHabia !== "function") {
    (g.window as Record<string, unknown>).addEventListener = noop;
    (g.window as Record<string, unknown>).removeEventListener = noop;
  }
  try {
    await fn();
  } finally {
    if (!habia) delete g.document;
  }
};

describe("Temporizadores reales del intervalo", () => {
  it("con la suscripción sana refresca 1 de cada N ticks", async () => {
    vi.useFakeTimers();
    try {
      await conDom(async () => {
        const { attachLiveRefresh } = await import("@/lib/realtime");
        let recargas = 0;
        const dispose = attachLiveRefresh({
          subscribe: () => ({ unsubscribe: () => {}, isHealthy: () => true }),
          reload: () => {
            recargas++;
          },
          ticksSano: 4,
          cadaMs: 5_000,
        });
        vi.advanceTimersByTime(5_000 * 12);
        dispose();
        /* 12 ticks, uno cada 4. */
        expect(recargas).toBe(3);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("con la suscripción caída refresca en cada tick", async () => {
    vi.useFakeTimers();
    try {
      await conDom(async () => {
        const { attachLiveRefresh } = await import("@/lib/realtime");
        let recargas = 0;
        const dispose = attachLiveRefresh({
          subscribe: () => ({ unsubscribe: () => {}, isHealthy: () => false }),
          reload: () => {
            recargas++;
          },
          ticksSano: 4,
          cadaMs: 5_000,
        });
        vi.advanceTimersByTime(5_000 * 12);
        dispose();
        expect(recargas).toBe(12);
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

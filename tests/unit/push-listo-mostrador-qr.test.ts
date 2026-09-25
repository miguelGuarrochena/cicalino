/**
 * El push de "pedido listo" de punta a punta, sin teléfono:
 *
 *   /api/push/notify (con la base y el envío simulados) → payload cifrable
 *   → public/sw.js (evento push) → notificación → toque → ventana que abre.
 *
 * Lo que fija: en Mostrador QR el aviso va a los teléfonos del comensal y
 * abre `/m/<pedidos.qr_token>` (ese pedido), nunca el QR general del local; si
 * falta pagar, lo recuerda. La modalidad Mesa sigue yendo al QR de la mesa.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/security/rateLimitShared", () => ({
  sharedRateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })),
}));
vi.mock("@/lib/security/ip", () => ({ clientIp: () => "127.0.0.1" }));
vi.mock("@/lib/push/server", () => ({
  vapidConfigured: true,
  webpush: { sendNotification: vi.fn(async () => ({ statusCode: 201 })) },
}));

import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { webpush } from "@/lib/push/server";
import { POST } from "@/app/api/push/notify/route";

const PEDIDO = "11111111-1111-4111-8111-111111111111";
const PEDIDO_QR = "22222222-2222-4222-8222-222222222222";
const LOCAL_QR = "33333333-3333-4333-8333-333333333333";
const MESA_QR = "44444444-4444-4444-8444-444444444444";
const COMENSAL = "55555555-5555-4555-8555-555555555555";

type Tabla = Record<string, unknown>;

/* Un cliente de supabase de mentira: cada tabla devuelve lo que se le diga,
 * y se anota qué filtros se usaron. */
const cliente = (tablas: Record<string, Tabla>, llamadas: string[] = []) => ({
  auth: { getUser: async () => ({ data: { user: { id: "staff-1" } } }) },
  from: (tabla: string) => {
    const r = tablas[tabla] ?? { data: null };
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "or", "in", "order", "limit", "update", "delete"]) {
      q[m] = (...args: unknown[]) => {
        llamadas.push(`${tabla}.${m}(${args.map((a) => JSON.stringify(a)).join(",")})`);
        return q;
      };
    }
    q.single = async () => r;
    q.maybeSingle = async () => r;
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(r).then(ok);
    return q;
  },
});

const escenario = (opts: { flujo: "mostrador_qr" | "autoservicio"; pagado: boolean }) => {
  const llamadas: string[] = [];
  const pedido = {
    data: {
      id: PEDIDO,
      referencia: "123",
      qr_token: PEDIDO_QR,
      estado: "listo",
      autoservicio: true,
      comensal_id: COMENSAL,
      sesion_id: "sesion-1",
    },
  };
  const tablas = {
    pedidos: pedido,
    push_subscriptions: {
      data: [{ id: "sub-1", endpoint: "https://push.example/abc", p256dh: "p", auth: "a" }],
    },
    mesa_sesiones: {
      data: {
        flujo: opts.flujo,
        mesas: opts.flujo === "autoservicio" ? { qr_token: MESA_QR } : null,
        /* Si el código leyera el QR del local, lo encontraría acá. */
        locales: { mostrador_qr_token: LOCAL_QR },
      },
    },
    pagos_mesa: { count: opts.pagado ? 1 : 0 },
  };
  vi.mocked(createServerSupabase).mockResolvedValue(cliente(tablas, llamadas) as never);
  vi.mocked(createAdminSupabase).mockReturnValue(cliente(tablas, llamadas) as never);
  return llamadas;
};

const notificar = () =>
  POST(
    new Request("http://localhost/api/push/notify", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ orderId: PEDIDO }),
    }),
  );

const payloadEnviado = () => {
  const send = vi.mocked(webpush.sendNotification);
  expect(send).toHaveBeenCalledTimes(1);
  const [sub, payload] = send.mock.calls[0]!;
  return { sub, payload: JSON.parse(String(payload)) as Record<string, string> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("push de listo — /api/push/notify", () => {
  it("Mostrador QR: abre el pedido (/m/<qr_token del pedido>), no el QR del local", async () => {
    const llamadas = escenario({ flujo: "mostrador_qr", pagado: true });
    const res = await notificar();
    expect(await res.json()).toEqual({ ok: true, enviados: 1 });

    const { sub, payload } = payloadEnviado();
    expect(sub).toEqual({ endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } });
    expect(payload.url).toBe(`/m/${PEDIDO_QR}`);
    expect(payload.url).not.toContain(LOCAL_QR);
    expect(payload).toMatchObject({
      titulo: "Cicalino",
      body: "Pedido 123 listo. Retiralo en el mostrador.",
      pedidoId: PEDIDO,
      tag: `cicalino-${PEDIDO}`,
    });
    /* Le llega a los teléfonos del comensal (y a los del pedido). */
    expect(llamadas).toContain(
      `push_subscriptions.or("pedido_id.eq.${PEDIDO},comensal_id.eq.${COMENSAL}")`,
    );
    /* Queda avisado. */
    expect(llamadas.some((l) => l.startsWith('pedidos.update({"avisado_en"'))).toBe(true);
  });

  it("Mostrador QR sin pagar: el aviso recuerda pagar al retirar", async () => {
    escenario({ flujo: "mostrador_qr", pagado: false });
    await notificar();
    const { payload } = payloadEnviado();
    expect(payload.url).toBe(`/m/${PEDIDO_QR}`);
    expect(payload.body).toBe("Pedido 123 listo. Retiralo y pagalo en el mostrador.");
  });

  it("Mesa no cambia: sigue abriendo el QR de la mesa", async () => {
    escenario({ flujo: "autoservicio", pagado: true });
    await notificar();
    const { payload } = payloadEnviado();
    expect(payload.url).toBe(`/m/${MESA_QR}`);
    expect(payload.body).toBe("Pedido 123 listo. Retiralo en el mostrador.");
  });

  it("sin sesión de personal no se envía nada", async () => {
    escenario({ flujo: "mostrador_qr", pagado: true });
    vi.mocked(createServerSupabase).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as never);
    const res = await notificar();
    expect(res.status).toBe(401);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});

describe("push de listo — public/sw.js", () => {
  /* El service worker real, en un sandbox con lo mínimo de `self`. */
  const cargarSw = () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    const mostradas: { titulo: string; opciones: { data: { url: string }; body: string; tag: string } }[] = [];
    const abiertas: string[] = [];
    const self = {
      location: { origin: "https://cicalino.net" },
      addEventListener: (tipo: string, fn: (e: unknown) => void) => {
        handlers[tipo] = fn;
      },
      registration: {
        showNotification: async (titulo: string, opciones: never) => {
          mostradas.push({ titulo, opciones });
        },
      },
      clients: {
        matchAll: async () => [],
        openWindow: async (url: string) => {
          abiertas.push(url);
          return null;
        },
        claim: async () => undefined,
      },
      skipWaiting: async () => undefined,
    };
    const src = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
    vm.runInNewContext(src, { self, URL, console, Promise, caches: {}, fetch: async () => null });
    return { handlers, mostradas, abiertas };
  };

  const evento = (extra: Record<string, unknown>) => {
    const pendientes: Promise<unknown>[] = [];
    return {
      e: { ...extra, waitUntil: (p: Promise<unknown>) => pendientes.push(p) },
      listo: () => Promise.all(pendientes),
    };
  };

  it("muestra el aviso y al tocarlo abre ese pedido", async () => {
    const sw = cargarSw();
    const payload = {
      titulo: "Cicalino",
      body: "Pedido 123 listo. Retiralo y pagalo en el mostrador.",
      url: `/m/${PEDIDO_QR}`,
      tag: `cicalino-${PEDIDO}`,
    };
    const push = evento({ data: { json: () => payload, text: () => JSON.stringify(payload) } });
    sw.handlers.push!(push.e);
    await push.listo();

    expect(sw.mostradas).toHaveLength(1);
    expect(sw.mostradas[0]!.titulo).toBe("Cicalino");
    expect(sw.mostradas[0]!.opciones).toMatchObject({
      body: payload.body,
      tag: payload.tag,
      data: { url: `/m/${PEDIDO_QR}` },
    });

    const click = evento({
      notification: { close: () => undefined, data: sw.mostradas[0]!.opciones.data },
    });
    sw.handlers.notificationclick!(click.e);
    await click.listo();
    expect(sw.abiertas).toEqual([`/m/${PEDIDO_QR}`]);
  });
});

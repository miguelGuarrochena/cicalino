/**
 * Seguimiento del pedido y avisos al cliente:
 *
 *   · el link individual (copiar, compartir, o verlo para copiar a mano);
 *   · el token del link solo para quien ya tiene acceso al pedido;
 *   · cuándo se ofrece Web Push y cuándo los pasos de iPhone;
 *   · que el aviso salga del estado real del pedido.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
import { POST as notify } from "@/app/api/push/notify/route";
import { fetchPickupState } from "@/lib/server/tablePickup";
import { copyTrackingLink, shareTrackingLink } from "@/lib/trackingLink";
import { canOfferWebPush, iosPushNeedsHomeScreen, webPushAvailable } from "@/lib/notifications";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const PEDIDO = "11111111-1111-4111-8111-111111111111";
const OTRO = "66666666-6666-4666-8666-666666666666";
const LINK = "22222222-2222-4222-8222-222222222222";
const LOCAL_QR = "33333333-3333-4333-8333-333333333333";
const COMENSAL = "55555555-5555-4555-8555-555555555555";

/* ---- Copiar y compartir --------------------------------------------------- */

describe("link del pedido: copiar y compartir", () => {
  const url = `https://cicalino.net/m/${LINK}`;

  it("copia el link exacto del pedido", async () => {
    const writeText = vi.fn(async () => {});
    expect(await copyTrackingLink(url, { writeText })).toBe("copiado");
    expect(writeText).toHaveBeenCalledWith(url);
  });

  it("sin portapapeles o con el permiso negado, ofrece copiarlo a mano", async () => {
    expect(await copyTrackingLink(url, undefined)).toBe("manual");
    const negado = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    expect(await copyTrackingLink(url, { writeText: negado })).toBe("manual");
  });

  it("compartir manda el link; cerrar la hoja no es error", async () => {
    const share = vi.fn(async () => {});
    expect(await shareTrackingLink({ url }, share)).toBe("compartido");
    expect(share).toHaveBeenCalledWith({ url });
    const cerrada = vi.fn(async () => {
      throw new DOMException("cancel", "AbortError");
    });
    expect(await shareTrackingLink({ url }, cerrada)).toBeNull();
  });

  it("sin Web Share o si falla, cae a copiar a mano", async () => {
    expect(await shareTrackingLink({ url }, undefined)).toBe("manual");
    const falla = vi.fn(async () => {
      throw new Error("boom");
    });
    expect(await shareTrackingLink({ url }, falla)).toBe("manual");
  });

  it("la pantalla no promete guardar nada sola y avisa que el link da acceso", () => {
    const es = read("src/lib/i18n.ts");
    const bloque = es.slice(es.indexOf("    enlace: {"), es.indexOf("    iosAvisos: {"));
    expect(bloque).toContain("privado:");
    expect(bloque).not.toMatch(/se guarda (solo|automáticamente)|quedó guardado/i);
    const comp = read("src/components/customer/TrackingLink.tsx");
    expect(comp).toContain('role="status"');
    /* Compartir aparece solo si el navegador lo tiene. */
    expect(comp).toMatch(/\{share && \(/);
  });
});

/* ---- El token del link, solo para quien ya tiene acceso ------------------ */

type Q = Record<string, unknown>;
const pedidoJson = (id: string) => ({
  id,
  referencia: "12",
  estado: "creado",
  flujo: "mostrador_qr",
  comensal_id: COMENSAL,
  creado_en: "2026-10-24T12:00:00Z",
  items: [],
});

const admin = (estado: Q, tokens: { id: string; qr_token: string }[], llamadas: string[]) => ({
  rpc: async () => ({ data: estado, error: null }),
  from: (tabla: string) => {
    const q: Q = {};
    for (const m of ["select", "eq", "in"]) {
      q[m] = (...args: unknown[]) => {
        llamadas.push(`${tabla}.${m}(${args.map((a) => JSON.stringify(a)).join(",")})`);
        return q;
      };
    }
    q.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve({ data: tokens, error: null }).then(ok);
    return q;
  },
});

const estadoMostrador = (over: Q = {}): Q => ({
  ok: true,
  mesa: null,
  local: { id: "local-1", nombre: "Café" },
  operativo: true,
  qr_vigente: true,
  pedido_link: false,
  comensal: { id: COMENSAL, nombre: "Ana", sesion_id: "s1" },
  pedidos: [pedidoJson(PEDIDO)],
  mesa_pedidos: [],
  ...over,
});

describe("token del link en el estado del mostrador", () => {
  it("el teléfono dueño recibe el link de SUS pedidos, filtrado por su comensal", async () => {
    const llamadas: string[] = [];
    vi.mocked(createAdminSupabase).mockReturnValue(
      admin(estadoMostrador(), [{ id: PEDIDO, qr_token: LINK }], llamadas) as never,
    );
    const res = await fetchPickupState(LOCAL_QR, { guestId: COMENSAL, tokenHash: "h" }, "mostrador_qr");
    expect(res.ok && res.state.orders[0]?.trackingToken).toBe(LINK);
    expect(llamadas).toContain(`pedidos.eq("comensal_id","${COMENSAL}")`);
    expect(llamadas).toContain(`pedidos.in("id",["${PEDIDO}"])`);
  });

  it("un pedido que la base no devuelve para ese comensal queda sin link", async () => {
    vi.mocked(createAdminSupabase).mockReturnValue(
      admin(estadoMostrador({ pedidos: [pedidoJson(PEDIDO), pedidoJson(OTRO)] }), [{ id: PEDIDO, qr_token: LINK }], []) as never,
    );
    const res = await fetchPickupState(LOCAL_QR, { guestId: COMENSAL, tokenHash: "h" }, "mostrador_qr");
    expect(res.ok && res.state.orders.map((o) => o.trackingToken)).toEqual([LINK, null]);
  });

  it("entrando por el link sin cookie: el token es el de la URL y no se consulta nada más", async () => {
    const llamadas: string[] = [];
    vi.mocked(createAdminSupabase).mockReturnValue(
      admin(estadoMostrador({ comensal: null, pedido_link: true, qr_vigente: false }), [], llamadas) as never,
    );
    const res = await fetchPickupState(LINK, null, "mostrador_qr");
    expect(res.ok && res.state.orders[0]?.trackingToken).toBe(LINK);
    expect(llamadas).toEqual([]);
  });

  it("sin cookie y sin link (el cartel del local) no hay pedidos ni tokens", async () => {
    vi.mocked(createAdminSupabase).mockReturnValue(
      admin(estadoMostrador({ comensal: null, pedidos: [] }), [], []) as never,
    );
    const res = await fetchPickupState(LOCAL_QR, null, "mostrador_qr");
    expect(res.ok && res.state.orders).toEqual([]);
  });

  it("Mesa no tiene link por pedido", async () => {
    const llamadas: string[] = [];
    vi.mocked(createAdminSupabase).mockReturnValue(
      admin(
        { ...estadoMostrador(), mesa: { id: "m1", numero: 4 }, local: null, pedidos: [{ ...pedidoJson(PEDIDO), flujo: "autoservicio" }] },
        [{ id: PEDIDO, qr_token: LINK }],
        llamadas,
      ) as never,
    );
    const res = await fetchPickupState(LOCAL_QR, { guestId: COMENSAL, tokenHash: "h" }, "autoservicio");
    expect(res.ok && res.state.orders[0]?.trackingToken).toBeNull();
    expect(llamadas).toEqual([]);
  });
});

/* ---- Cuándo se ofrece Web Push ------------------------------------------- */

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

const navegador = (o: {
  ua: string;
  push: boolean;
  standalone?: boolean;
  permiso?: NotificationPermission;
}) => {
  vi.stubGlobal("navigator", {
    userAgent: o.ua,
    platform: "",
    maxTouchPoints: 5,
    standalone: o.standalone ?? false,
    ...(o.push ? { serviceWorker: {} } : {}),
  });
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("standalone") && Boolean(o.standalone) }));
  if (o.push) {
    vi.stubGlobal("PushManager", function PushManager() {});
    vi.stubGlobal("Notification", { permission: o.permiso ?? "default" });
  } else {
    delete (globalThis as Record<string, unknown>).PushManager;
    delete (globalThis as Record<string, unknown>).Notification;
  }
};

describe("Web Push: capacidad, no promesa", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "clave");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    delete (globalThis as Record<string, unknown>).PushManager;
    delete (globalThis as Record<string, unknown>).Notification;
  });

  it("Android: se ofrece en la pestaña y nunca ve los pasos de iPhone", () => {
    navegador({ ua: ANDROID, push: true });
    expect(canOfferWebPush()).toBe(true);
    expect(webPushAvailable()).toBe(true);
    expect(iosPushNeedsHomeScreen()).toBe(false);
  });

  it("iPhone en Safari, sin agregar: no hay botón, sí los pasos", () => {
    navegador({ ua: IPHONE_SAFARI, push: false });
    expect(canOfferWebPush()).toBe(false);
    expect(webPushAvailable()).toBe(false);
    expect(iosPushNeedsHomeScreen()).toBe(true);
  });

  it("iPhone abierto desde la pantalla de inicio: se ofrece y no repite los pasos", () => {
    navegador({ ua: IPHONE_SAFARI, push: true, standalone: true });
    expect(canOfferWebPush()).toBe(true);
    expect(webPushAvailable()).toBe(true);
    expect(iosPushNeedsHomeScreen()).toBe(false);
  });

  it("Chrome en iPhone: sin botón y sin los pasos de Safari", () => {
    navegador({ ua: IPHONE_CHROME, push: false });
    expect(canOfferWebPush()).toBe(false);
    expect(iosPushNeedsHomeScreen()).toBe(false);
  });

  it("permiso ya negado: no se vuelve a pedir", () => {
    navegador({ ua: ANDROID, push: true, permiso: "denied" });
    expect(webPushAvailable()).toBe(false);
  });

  it("sin clave VAPID no se muestran los pasos de iPhone", () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    navegador({ ua: IPHONE_SAFARI, push: false });
    expect(iosPushNeedsHomeScreen()).toBe(false);
  });

  it("los pasos de iPhone van solo donde la app agregada abre en el pedido", () => {
    expect(read("src/components/customer/CustomerWaiting.tsx")).toContain("<IosPushSteps");
    expect(read("src/components/customer/table/TablePickupApp.tsx")).toContain("<IosPushSteps");
    expect(read("src/components/customer/table/TableGuestApp.tsx")).not.toContain("IosPushSteps");
    expect(read("src/components/customer/CustomerEsperaWaiting.tsx")).not.toContain("IosPushSteps");
    const manifest = read("src/app/(customer)/m/[token]/manifest.webmanifest/route.ts");
    expect(manifest).toContain("start_url: `/m/${token}`");
    expect(read("src/app/(customer)/m/[token]/page.tsx")).toContain(
      "...(counter.ok ? {} : { manifest: `/m/${token}/manifest.webmanifest` })",
    );
  });

  it("entrando por el link sin cookie, el aviso se ata al pedido por su token", () => {
    const app = read("src/components/customer/table/TablePickupApp.tsx");
    expect(app).toContain('const linkOnly = counter && !guestId && state?.orderLink === true;');
    expect(app).toContain("(linkOnly ? {} : { url: `/api/m/${token}/autoservicio/avisos` })");
  });
});

/* ---- El aviso sale del estado real del pedido ----------------------------- */

const cliente = (pedido: Q, llamadas: string[], subs: Q[] = [{ id: "sub-1", endpoint: "https://push.example/a", p256dh: "p", auth: "a" }]) => ({
  auth: { getUser: async () => ({ data: { user: { id: "staff-1" } } }) },
  from: (tabla: string) => {
    const r =
      tabla === "pedidos"
        ? { data: pedido }
        : tabla === "push_subscriptions"
          ? { data: subs }
          : { data: null, count: 0 };
    const q: Q = {};
    for (const m of ["select", "eq", "or", "in", "update", "delete"]) {
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

const pedir = () =>
  notify(
    new Request("https://cicalino.net/api/push/notify", {
      method: "POST",
      headers: { origin: "https://cicalino.net", "content-type": "application/json" },
      body: JSON.stringify({ orderId: PEDIDO }),
    }),
  );

describe("aviso de listo: estado real, sin duplicar por llamadas viejas", () => {
  beforeEach(() => vi.mocked(webpush.sendNotification).mockClear());

  const pedidoEn = (estado: string): Q => ({
    id: PEDIDO,
    referencia: "12",
    qr_token: LINK,
    estado,
    autoservicio: false,
    comensal_id: null,
    sesion_id: null,
  });

  it.each(["creado", "en_preparacion", "cancelado"])(
    "con el pedido en %s no manda ni sella avisado_en",
    async (estado) => {
      const llamadas: string[] = [];
      vi.mocked(createServerSupabase).mockResolvedValue(cliente(pedidoEn(estado), llamadas) as never);
      vi.mocked(createAdminSupabase).mockReturnValue(cliente(pedidoEn(estado), llamadas) as never);
      const body = (await (await pedir()).json()) as { ok: boolean; enviados: number };
      expect(body).toMatchObject({ ok: true, enviados: 0 });
      expect(webpush.sendNotification).not.toHaveBeenCalled();
      expect(llamadas.some((l) => l.startsWith("pedidos.update"))).toBe(false);
    },
  );

  it("listo: manda a las suscripciones del pedido y sella avisado_en", async () => {
    const llamadas: string[] = [];
    vi.mocked(createServerSupabase).mockResolvedValue(cliente(pedidoEn("listo"), llamadas) as never);
    vi.mocked(createAdminSupabase).mockReturnValue(cliente(pedidoEn("listo"), llamadas) as never);
    const body = (await (await pedir()).json()) as { ok: boolean; enviados: number };
    expect(body).toMatchObject({ ok: true, enviados: 1 });
    expect(llamadas).toContain(`push_subscriptions.eq("pedido_id","${PEDIDO}")`);
    expect(llamadas.some((l) => l.startsWith("pedidos.update"))).toBe(true);
  });

  it("una suscripción vencida (410) se borra y el envío no rompe", async () => {
    const llamadas: string[] = [];
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(
      Object.assign(new Error("gone"), { statusCode: 410 }),
    );
    vi.mocked(createServerSupabase).mockResolvedValue(cliente(pedidoEn("listo"), llamadas) as never);
    vi.mocked(createAdminSupabase).mockReturnValue(cliente(pedidoEn("listo"), llamadas) as never);
    const res = await pedir();
    expect(res.status).toBe(200);
    expect((await res.json()) as Q).toMatchObject({ ok: true, enviados: 0 });
    expect(llamadas).toContain("push_subscriptions.delete()");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: vi.fn(),
}));

import { createAdminSupabase } from "@/lib/supabase/admin";
import { resolveTableQr } from "@/lib/server/tableGuest";
import { resolvePickupAccess, resolvePickupQr } from "@/lib/server/tablePickup";

/* El QR de una mesa real no puede terminar en la pantalla del mostrador.
 *
 * mesa_por_qr dice not-found también para una mesa que existe pero que hoy
 * no toma pedidos (Mesa apagada). Antes ese token seguía de largo hacia el
 * mostrador: con la cookie de un pedido del mostrador en el teléfono,
 * mostrador_qr_estado lo tomaba por un cartel regenerado y la mesa se veía
 * como "Pedí desde tu celular · Este QR ya no está vigente". */

const MESA = "11111111-1111-4111-8111-111111111111";
const VIEJO = "22222222-2222-4222-8222-222222222222";
const LOCAL = "33333333-3333-4333-8333-333333333333";
const creds = { guestId: "44444444-4444-4444-8444-444444444444", tokenHash: "h" };

type Rpc = (fn: string, args: Record<string, unknown>) => unknown;

const admin = (opts: { tables: string[]; rpc: Rpc }) => {
  const rpcCalls: string[] = [];
  const client = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push(fn);
      return { data: opts.rpc(fn, args), error: null };
    }),
    from: vi.fn((table: string) => {
      expect(table).toBe("mesas");
      let token = "";
      const q = {
        select: () => q,
        eq: (_col: string, v: string) => {
          token = v;
          return q;
        },
        maybeSingle: async () => ({
          data: opts.tables.includes(token) ? { id: "m1" } : null,
          error: null,
        }),
      };
      return q;
    }),
  };
  vi.mocked(createAdminSupabase).mockReturnValue(client as never);
  return rpcCalls;
};

/* Un teléfono que ya pidió en el mostrador de LOCAL: cualquier token
 * desconocido le devuelve su pedido como "QR no vigente". */
const counterGuestRpc: Rpc = (fn) => {
  if (fn === "mesa_por_qr") return { ok: false, reason: "not-found" };
  if (fn === "mostrador_qr_por_token") return { ok: false, reason: "not-found" };
  if (fn === "mostrador_qr_estado") {
    return {
      ok: true,
      mesa: null,
      local: { id: LOCAL, nombre: "Local" },
      operativo: true,
      qr_vigente: false,
      pedido_link: false,
      comensal: { id: creds.guestId, nombre: "Ana", sesion_id: "s1" },
      sesion_abierta: false,
      pedidos: [],
      mesa_pedidos: [],
    };
  }
  throw new Error(`rpc inesperada: ${fn}`);
};

describe("QR de mesa — no se confunde con el mostrador", () => {
  beforeEach(() => vi.clearAllMocks());

  it("una mesa que existe pero no toma pedidos es not-available, no not-found", async () => {
    admin({ tables: [MESA], rpc: counterGuestRpc });
    expect(await resolveTableQr(MESA)).toEqual({ ok: false, reason: "not-available" });
  });

  it("un token que no es de ninguna mesa sigue siendo not-found", async () => {
    admin({ tables: [MESA], rpc: counterGuestRpc });
    expect(await resolveTableQr(VIEJO)).toEqual({ ok: false, reason: "not-found" });
  });

  it("el QR de la mesa no se resuelve como el mostrador", async () => {
    const calls = admin({ tables: [MESA], rpc: counterGuestRpc });
    expect(await resolvePickupQr(MESA)).toEqual({ ok: false, reason: "not-available" });
    expect(calls).not.toContain("mostrador_qr_por_token");
  });

  it("con la cookie del mostrador, el QR de la mesa no abre el mostrador", async () => {
    const calls = admin({ tables: [MESA], rpc: counterGuestRpc });
    const res = await resolvePickupAccess(MESA, creds);
    expect(res).toEqual({ ok: false, reason: "not-available" });
    expect(calls).not.toContain("mostrador_qr_estado");
  });

  it("un cartel del mostrador regenerado sigue mostrando lo ya pedido", async () => {
    admin({ tables: [MESA], rpc: counterGuestRpc });
    const res = await resolvePickupAccess(VIEJO, creds);
    expect(res).toMatchObject({ ok: true, flow: "mostrador_qr", tableNumber: null, stale: true });
  });

  it("una mesa de modalidad Mesa sigue yendo a su flujo con su número", async () => {
    admin({
      tables: [MESA],
      rpc: (fn) => {
        if (fn === "mesa_por_qr") {
          return {
            ok: true,
            mesa_id: "m1",
            mesa_numero: 7,
            local_id: LOCAL,
            local_nombre: "Local",
            flujo: "autoservicio",
            operativo: true,
            bloqueo: null,
          };
        }
        throw new Error(`rpc inesperada: ${fn}`);
      },
    });
    expect(await resolvePickupAccess(MESA, creds)).toMatchObject({
      ok: true,
      flow: "autoservicio",
      tableNumber: 7,
    });
  });
});

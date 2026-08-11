import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: vi.fn(),
}));

vi.mock("@/lib/security/rateLimitShared", () => ({
  sharedRateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })),
}));

vi.mock("@/lib/security/ip", () => ({
  clientIp: () => "127.0.0.1",
}));

import { createAdminSupabase } from "@/lib/supabase/admin";
import { POST } from "@/app/api/push/subscribe/route";

const createAdminMock = vi.mocked(createAdminSupabase);

const token = "00000000-0000-4000-8000-000000000099";
const body = {
  token,
  subscription: {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: { p256dh: "p256dh-key-xx", auth: "auth-key" },
  },
};

const req = () =>
  new Request("http://localhost/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Medium — push/subscribe respeta qr_expira_en", () => {
  it("rechaza pedido con QR vencido", async () => {
    const upsert = vi.fn();
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "pedido-1",
        qr_expira_en: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    createAdminMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
        upsert,
      })),
    } as never);

    const res = await POST(req());
    expect(await res.json()).toEqual({ ok: false, reason: "expired" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rechaza espera con QR vencido", async () => {
    const upsert = vi.fn();
    const maybeSinglePedido = vi.fn().mockResolvedValue({ data: null });
    const maybeSingleEspera = vi.fn().mockResolvedValue({
      data: {
        id: "espera-1",
        qr_expira_en: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    let calls = 0;
    createAdminMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "pedidos") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: maybeSinglePedido })),
            })),
          };
        }
        if (table === "esperas") {
          calls += 1;
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: maybeSingleEspera })),
            })),
          };
        }
        return { upsert };
      }),
    } as never);

    const res = await POST(req());
    expect(await res.json()).toEqual({ ok: false, reason: "expired" });
    expect(calls).toBe(1);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("acepta pedido con QR vigente y hace upsert", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "pedido-1",
        qr_expira_en: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });
    createAdminMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "pedidos") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle })),
            })),
          };
        }
        return { upsert };
      }),
    } as never);

    const res = await POST(req());
    expect(await res.json()).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("selecciona qr_expira_en en la consulta (no solo id)", async () => {
    const select = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: "pedido-1",
            qr_expira_en: new Date(Date.now() + 3_600_000).toISOString(),
          },
        }),
      })),
    }));
    createAdminMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "pedidos") return { select };
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }),
    } as never);

    await POST(req());
    expect(select).toHaveBeenCalledWith("id, qr_expira_en");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: vi.fn(),
}));

vi.mock("@/lib/email/resend", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/appUrl", () => ({
  appBaseUrl: () => "https://www.cicalino.net",
  assetUrl: (path: string) => `https://www.cicalino.net${path}`,
}));

import { createAdminSupabase } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import {
  sendWelcomeEmail,
  sweepSubscriptions,
} from "@/lib/server/subscriptionSweep";

const createAdminMock = vi.mocked(createAdminSupabase);
const sendEmailMock = vi.mocked(sendEmail);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Medium — stamp de email solo si el envío OK", () => {
  it("sweepSubscriptions no marca aviso si Resend falla", async () => {
    sendEmailMock.mockResolvedValue(false);
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          id: "org-1",
          nombre: "Local",
          dueno_email: "a@b.com",
          plan: "mensual",
          estado_suscripcion: "trial",
          prueba_fin: "2099-01-10",
          proxima_factura: "2099-01-11",
          aviso_prueba_5d_en: null,
          aviso_prueba_fin_en: null,
          aviso_cobro_en: null,
        },
      ],
      error: null,
    });
    /* Forzar planDailyActions a emitir trial_5d: hoy = 5 días antes del fin.
     * Usamos fechas relativas al "hoy" real del cron (toDateOnly(new Date())).
     * Más simple: mockear una org overdue/pending que dispare overdue. */
    const hoy = new Date();
    const fin = new Date(hoy);
    fin.setDate(fin.getDate() + 5);
    const ymd = (d: Date) => d.toISOString().slice(0, 10);

    limit.mockResolvedValue({
      data: [
        {
          id: "org-1",
          nombre: "Local",
          dueno_email: "a@b.com",
          plan: "mensual",
          estado_suscripcion: "trial",
          prueba_fin: ymd(fin),
          proxima_factura: ymd(fin),
          aviso_prueba_5d_en: null,
          aviso_prueba_fin_en: null,
          aviso_cobro_en: null,
        },
      ],
      error: null,
    });

    createAdminMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit,
        update,
      })),
    } as never);

    const res = await sweepSubscriptions();
    expect(res.ok).toBe(true);
    expect(sendEmailMock).toHaveBeenCalled();
    expect(res.mails).toBe(0);
    /* Sin stamp ni cambio de estado accionable aparte del mail → no update,
     * o update sin marcas de aviso. */
    if (update.mock.calls.length) {
      const patch = update.mock.calls[0][0] as Record<string, unknown>;
      expect(patch.aviso_prueba_5d_en).toBeUndefined();
    }
  });

  it("sweepSubscriptions sí marca aviso cuando el mail sale", async () => {
    sendEmailMock.mockResolvedValue(true);
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const hoy = new Date();
    const fin = new Date(hoy);
    fin.setDate(fin.getDate() + 5);
    const ymd = (d: Date) => d.toISOString().slice(0, 10);

    createAdminMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              id: "org-1",
              nombre: "Local",
              dueno_email: "a@b.com",
              plan: "mensual",
              estado_suscripcion: "trial",
              prueba_fin: ymd(fin),
              proxima_factura: ymd(fin),
              aviso_prueba_5d_en: null,
              aviso_prueba_fin_en: null,
              aviso_cobro_en: null,
            },
          ],
          error: null,
        }),
        update,
      })),
    } as never);

    const res = await sweepSubscriptions();
    expect(res.mails).toBe(1);
    expect(update).toHaveBeenCalled();
    const patch = update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.aviso_prueba_5d_en).toEqual(expect.any(String));
  });

  it("sendWelcomeEmail no stamp bienvenida_en si Resend falla", async () => {
    sendEmailMock.mockResolvedValue(false);
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    createAdminMock.mockReturnValue({
      from: vi.fn(() => ({ update })),
    } as never);

    const ok = await sendWelcomeEmail({
      orgId: "org-1",
      nombre: "Local",
      email: "a@b.com",
      pruebaFin: "2099-01-01",
      primeraFactura: "2099-02-01",
    });
    expect(ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("sendWelcomeEmail stamp bienvenida_en solo si el mail OK", async () => {
    sendEmailMock.mockResolvedValue(true);
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    createAdminMock.mockReturnValue({
      from: vi.fn(() => ({ update })),
    } as never);

    const ok = await sendWelcomeEmail({
      orgId: "org-1",
      nombre: "Local",
      email: "a@b.com",
      pruebaFin: "2099-01-01",
      primeraFactura: "2099-02-01",
    });
    expect(ok).toBe(true);
    expect(update).toHaveBeenCalledWith({
      bienvenida_en: expect.any(String),
    });
  });
});

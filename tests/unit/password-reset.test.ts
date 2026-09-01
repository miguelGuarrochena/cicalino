import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(new Headers({ "x-forwarded-for": "203.0.113.7" })),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/security/rateLimitShared", () => ({
  sharedRateLimit: vi.fn(),
}));
vi.mock("@/lib/appUrl", () => ({
  appBaseUrl: () => "https://www.cicalino.net",
  assetUrl: (p: string) => `https://www.cicalino.net${p}`,
}));

import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { sharedRateLimit } from "@/lib/security/rateLimitShared";
import {
  requestPasswordReset,
  resetPassword,
} from "@/lib/actions/password";
import { PASSWORD_MIN } from "@/lib/auth/password";

const adminMock = vi.mocked(createAdminSupabase);
const serverMock = vi.mocked(createServerSupabase);
const sendEmailMock = vi.mocked(sendEmail);
const rateMock = vi.mocked(sharedRateLimit);

const TOKEN = "abcdef0123456789abcdef0123456789";

const permitir = () => rateMock.mockResolvedValue({ ok: true, retryAfter: 0 });
const bloquear = () => rateMock.mockResolvedValue({ ok: false, retryAfter: 60 });

const adminCon = (link: {
  hashed_token?: string;
  error?: string;
}) =>
  ({
    auth: {
      admin: {
        generateLink: vi.fn().mockResolvedValue({
          data: link.hashed_token
            ? { properties: { hashed_token: link.hashed_token } }
            : null,
          error: link.error ? { message: link.error } : null,
        }),
      },
    },
  }) as unknown as ReturnType<typeof createAdminSupabase>;

const serverCon = (opts: { otpError?: string; updError?: string }) => {
  const verifyOtp = vi.fn().mockResolvedValue({
    error: opts.otpError ? { message: opts.otpError } : null,
  });
  const updateUser = vi.fn().mockResolvedValue({
    error: opts.updError ? { message: opts.updError } : null,
  });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const client = { auth: { verifyOtp, updateUser, signOut } };
  return {
    client: client as unknown as Awaited<
      ReturnType<typeof createServerSupabase>
    >,
    verifyOtp,
    updateUser,
    signOut,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  permitir();
});

describe("Pedir el link de recuperación", () => {
  it("con cuenta existente manda el mail con el token en la URL", async () => {
    adminMock.mockReturnValue(adminCon({ hashed_token: TOKEN }));
    sendEmailMock.mockResolvedValue(true);

    const r = await requestPasswordReset("  Dueno@Local.com  ");

    expect(r).toEqual({ ok: true });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const arg = sendEmailMock.mock.calls[0][0];
    // El email se normaliza en el schema antes de usarse como destinatario.
    expect(arg.to).toBe("dueno@local.com");
    expect(arg.tipo).toBe("recuperacion");
    expect(arg.html).toContain(
      `https://www.cicalino.net/recuperar?token=${TOKEN}`,
    );
  });

  it("con cuenta inexistente contesta igual y no manda nada", async () => {
    /* Si contestara distinto, el formulario serviría para averiguar qué
     * direcciones tienen cuenta en Cicalino. */
    adminMock.mockReturnValue(adminCon({ error: "User not found" }));

    const r = await requestPasswordReset("nadie@ejemplo.com");

    expect(r).toEqual({ ok: true });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("un email inválido no llega a generar nada", async () => {
    adminMock.mockReturnValue(adminCon({ hashed_token: TOKEN }));
    const r = await requestPasswordReset("no-es-un-mail");
    expect(r).toEqual({ ok: false, reason: "invalido" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("respeta el rate limit", async () => {
    bloquear();
    adminMock.mockReturnValue(adminCon({ hashed_token: TOKEN }));
    const r = await requestPasswordReset("dueno@local.com");
    expect(r).toEqual({ ok: false, reason: "rate-limited" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("Canjear el link y dejar la contraseña nueva", () => {
  it("token válido: cambia la contraseña y cierra la sesión", async () => {
    const s = serverCon({});
    serverMock.mockResolvedValue(s.client);

    const r = await resetPassword(TOKEN, "unaClaveLarga1");

    expect(r).toEqual({ ok: true });
    expect(s.verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: TOKEN,
    });
    expect(s.updateUser).toHaveBeenCalledWith({ password: "unaClaveLarga1" });
    /* verifyOtp deja al usuario logueado; el store del cliente solo lo llena
     * signIn, así que se cierra y entra por la puerta de siempre. */
    expect(s.signOut).toHaveBeenCalled();
  });

  it("token vencido o ya usado: no cambia nada y pide otro link", async () => {
    const s = serverCon({ otpError: "Token has expired or is invalid" });
    serverMock.mockResolvedValue(s.client);

    const r = await resetPassword(TOKEN, "unaClaveLarga1");

    expect(r).toEqual({ ok: false, reason: "expirado" });
    expect(s.updateUser).not.toHaveBeenCalled();
  });

  it("token con forma inválida ni siquiera toca Supabase", async () => {
    const s = serverCon({});
    serverMock.mockResolvedValue(s.client);

    const r = await resetPassword("corto", "unaClaveLarga1");

    expect(r).toEqual({ ok: false, reason: "invalido" });
    expect(s.verifyOtp).not.toHaveBeenCalled();
  });

  it("una contraseña corta no quema el token", async () => {
    /* El token es de un solo uso: si se validara después de canjearlo, el
     * usuario perdería el link por un error de tipeo. */
    const s = serverCon({});
    serverMock.mockResolvedValue(s.client);

    const r = await resetPassword(TOKEN, "a".repeat(PASSWORD_MIN - 1));

    expect(r).toEqual({ ok: false, reason: "corta" });
    expect(s.verifyOtp).not.toHaveBeenCalled();
  });

  it("si Supabase rechaza la contraseña, no deja la sesión abierta", async () => {
    const s = serverCon({ updError: "Password should be at least 6 chars" });
    serverMock.mockResolvedValue(s.client);

    const r = await resetPassword(TOKEN, "unaClaveLarga1");

    expect(r).toEqual({ ok: false, reason: "corta" });
    expect(s.signOut).toHaveBeenCalled();
  });

  it("respeta el rate limit por token", async () => {
    bloquear();
    const s = serverCon({});
    serverMock.mockResolvedValue(s.client);

    const r = await resetPassword(TOKEN, "unaClaveLarga1");

    expect(r).toEqual({ ok: false, reason: "rate-limited" });
    expect(s.verifyOtp).not.toHaveBeenCalled();
  });
});

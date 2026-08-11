import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: vi.fn(),
}));

vi.mock("@/lib/email/resend", () => ({
  sendEmail: vi.fn(async () => true),
  resendConfigured: true,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "127.0.0.1" })),
}));

vi.mock("@/lib/security/rateLimitShared", () => ({
  sharedRateLimit: vi.fn(async () => ({ ok: true, remaining: 1 })),
}));

import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { sendContractLink, getContractLink } from "@/lib/actions/contract";
import {
  checkBillingOnAdminOpen,
  listPendingCharges,
} from "@/lib/actions/billing";
import { sendBillingReminders } from "@/lib/server/billingReminders";
import {
  sweepSubscriptions,
  sendWelcomeEmail,
} from "@/lib/server/subscriptionSweep";
import { sendContractLinkInternal } from "@/lib/server/sendContractLink";

const root = join(process.cwd());
const PRIVILEGED = [
  "sweepSubscriptions",
  "sendBillingReminders",
  "sendWelcomeEmail",
  "sendContractLinkInternal",
] as const;

const listTsFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
};

const getCurrentProfileMock = vi.mocked(getCurrentProfile);
const createAdminMock = vi.mocked(createAdminSupabase);
const sendEmailMock = vi.mocked(sendEmail);

const perfil = (rol: "superadmin" | "admin" | "supervisor") => ({
  id: "u1",
  email: "test@example.com",
  rol,
  organizationId: "org-1",
  localId: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentProfileMock.mockResolvedValue(null);
  createAdminMock.mockReturnValue(null);
});

describe("Critical #1 — privileged helpers are not Server Actions", () => {
  it("vive en módulos server-only, no en \"use server\"", () => {
    const homes: Record<(typeof PRIVILEGED)[number], string> = {
      sweepSubscriptions: "src/lib/server/subscriptionSweep.ts",
      sendWelcomeEmail: "src/lib/server/subscriptionSweep.ts",
      sendBillingReminders: "src/lib/server/billingReminders.ts",
      sendContractLinkInternal: "src/lib/server/sendContractLink.ts",
    };

    for (const [fn, rel] of Object.entries(homes)) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src, `${fn} debe usar server-only`).toMatch(
        /import\s+["']server-only["']/,
      );
      expect(src, `${fn} no debe ser Server Action`).not.toMatch(
        /^["']use server["']/m,
      );
      expect(src).toContain(`export const ${fn}`);
    }
  });

  it("ningún módulo \"use server\" exporta las cuatro funciones privilegiadas", () => {
    const actionFiles = listTsFiles(join(root, "src")).filter((f) => {
      const src = readFileSync(f, "utf8");
      return /^["']use server["']/m.test(src);
    });

    for (const file of actionFiles) {
      const src = readFileSync(file, "utf8");
      for (const name of PRIVILEGED) {
        expect(
          src,
          `${name} no debe exportarse desde ${file.replace(root + "/", "")}`,
        ).not.toMatch(new RegExp(`export\\s+(async\\s+)?(?:function|const)\\s+${name}\\b`));
      }
    }
  });

  it("el archivo viejo de actions/subscriptionSweep ya no existe", () => {
    expect(() =>
      readFileSync(join(root, "src/lib/actions/subscriptionSweep.ts")),
    ).toThrow();
  });
});

describe("Critical #1 — cron usa helpers internos", () => {
  it("el cron importa sweepSubscriptions y sendBillingReminders desde lib/server", () => {
    const cron = readFileSync(
      join(root, "src/app/api/cron/cobros/route.ts"),
      "utf8",
    );
    expect(cron).toContain(
      'from "@/lib/server/subscriptionSweep"',
    );
    expect(cron).toContain('from "@/lib/server/billingReminders"');
    expect(cron).not.toContain("@/lib/actions/subscriptionSweep");
    expect(cron).not.toMatch(
      /import\s+\{\s*sendBillingReminders\s*\}\s+from\s+["']@\/lib\/actions\/billing["']/,
    );
    expect(cron).toContain("await sweepSubscriptions()");
    expect(cron).toContain("await sendBillingReminders()");
  });
});

describe("Critical #1 — Server Actions gated: no autenticado", () => {
  it("sendContractLink rechaza sin sesión", async () => {
    getCurrentProfileMock.mockResolvedValue(null);
    const res = await sendContractLink(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(res).toEqual({ ok: false, error: "No autorizado" });
    expect(createAdminMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("getContractLink rechaza sin sesión", async () => {
    getCurrentProfileMock.mockResolvedValue(null);
    const res = await getContractLink(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(res).toEqual({ ok: false, error: "No autorizado" });
    expect(createAdminMock).not.toHaveBeenCalled();
  });

  it("checkBillingOnAdminOpen no dispara reminders sin sesión", async () => {
    getCurrentProfileMock.mockResolvedValue(null);
    await checkBillingOnAdminOpen();
    expect(createAdminMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("listPendingCharges devuelve vacío sin sesión", async () => {
    getCurrentProfileMock.mockResolvedValue(null);
    await expect(listPendingCharges()).resolves.toEqual([]);
    expect(createAdminMock).not.toHaveBeenCalled();
  });
});

describe("Critical #1 — Server Actions gated: autenticado sin permiso", () => {
  it.each(["admin", "supervisor"] as const)(
    "sendContractLink rechaza rol %s",
    async (rol) => {
      getCurrentProfileMock.mockResolvedValue(perfil(rol));
      const res = await sendContractLink(
        "00000000-0000-4000-8000-000000000001",
      );
      expect(res).toEqual({ ok: false, error: "No autorizado" });
      expect(createAdminMock).not.toHaveBeenCalled();
      expect(sendEmailMock).not.toHaveBeenCalled();
    },
  );

  it.each(["admin", "supervisor"] as const)(
    "checkBillingOnAdminOpen no corre con rol %s",
    async (rol) => {
      getCurrentProfileMock.mockResolvedValue(perfil(rol));
      await checkBillingOnAdminOpen();
      expect(createAdminMock).not.toHaveBeenCalled();
      expect(sendEmailMock).not.toHaveBeenCalled();
    },
  );

  it.each(["admin", "supervisor"] as const)(
    "listPendingCharges vacío con rol %s",
    async (rol) => {
      getCurrentProfileMock.mockResolvedValue(perfil(rol));
      await expect(listPendingCharges()).resolves.toEqual([]);
      expect(createAdminMock).not.toHaveBeenCalled();
    },
  );
});

describe("Critical #1 — helpers internos invocables desde server autorizado", () => {
  it("sweepSubscriptions falla cerrado si no hay service role", async () => {
    createAdminMock.mockReturnValue(null);
    await expect(sweepSubscriptions()).resolves.toEqual({
      ok: false,
      revisadas: 0,
      mails: 0,
      cambios: 0,
    });
  });

  it("sendBillingReminders falla cerrado si no hay service role", async () => {
    createAdminMock.mockReturnValue(null);
    await expect(sendBillingReminders()).resolves.toEqual({
      ok: false,
      avisados: 0,
    });
  });

  it("sendWelcomeEmail falla cerrado si no hay service role", async () => {
    createAdminMock.mockReturnValue(null);
    await expect(
      sendWelcomeEmail({
        orgId: "org-1",
        nombre: "Local",
        email: "a@b.com",
        pruebaFin: "2026-09-01",
        primeraFactura: "2026-09-02",
      }),
    ).resolves.toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sendContractLinkInternal falla cerrado si no hay service role", async () => {
    createAdminMock.mockReturnValue(null);
    await expect(
      sendContractLinkInternal("00000000-0000-4000-8000-000000000001"),
    ).resolves.toEqual({ ok: false, error: "Falta SUPABASE_SECRET_KEY" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sweepSubscriptions recorre orgs cuando el admin client responde", async () => {
    const from = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));
    createAdminMock.mockReturnValue({ from } as never);

    await expect(sweepSubscriptions()).resolves.toEqual({
      ok: true,
      revisadas: 0,
      mails: 0,
      cambios: 0,
    });
    expect(from).toHaveBeenCalledWith("organizaciones");
  });

  it("sendContractLink (superadmin) llega al helper interno", async () => {
    getCurrentProfileMock.mockResolvedValue(perfil("superadmin"));
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "00000000-0000-4000-8000-000000000001",
        nombre: "Org",
        dueno_email: "dueno@example.com",
        plan: "mensual",
        cupo: 1,
        mes_gratis_hasta: null,
        responsable: null,
        locales: [],
      },
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const update = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    const from = vi.fn(() => ({ select, update }));
    createAdminMock.mockReturnValue({ from } as never);

    const res = await sendContractLink(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.url).toContain("/aceptar/");
    }
    expect(update).toHaveBeenCalled();
    expect(sendEmailMock).toHaveBeenCalledOnce();
  });
});

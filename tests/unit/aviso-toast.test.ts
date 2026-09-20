import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { avisoToastKind, type NotifyResult } from "@/lib/notify";

const okPush: NotifyResult = { ok: true, delivered: 1 };
const okSinPush: NotifyResult = { ok: true, delivered: 0 };
const fallo: NotifyResult = { ok: false, delivered: 0 };
const visto = "2026-09-20T12:00:00.000Z";

describe("avisoToastKind", () => {
  it("sin resultado no tapa el toast de la acción", () => {
    expect(avisoToastKind(null, visto)).toBe("silent");
  });

  it("si la acción de avisar falla, es error", () => {
    expect(avisoToastKind(fallo, visto)).toBe("error");
    expect(avisoToastKind(fallo, null)).toBe("error");
  });

  it("push entregado cuenta como avisado, haya o no abierto el QR", () => {
    expect(avisoToastKind(okPush, null)).toBe("ok");
    expect(avisoToastKind(okPush, visto)).toBe("ok");
  });

  it("sin push, abrir el QR (visto_en) también cuenta como avisado", () => {
    expect(avisoToastKind(okSinPush, visto)).toBe("ok");
  });

  it("delivered === 0 no prueba que no se avisó: solo falta si tampoco hay visto_en", () => {
    expect(avisoToastKind(okSinPush, null)).toBe("missed");
    expect(avisoToastKind(okSinPush, undefined)).toBe("missed");
    expect(avisoToastKind(okSinPush, "")).toBe("missed");
  });
});

describe("Pedidos y Recepción combinan los dos canales", () => {
  const root = process.cwd();
  const pedidos = readFileSync(
    join(root, "src/app/(app)/panel/pedidos/page.tsx"),
    "utf8",
  );
  const espera = readFileSync(
    join(root, "src/app/(app)/panel/espera/page.tsx"),
    "utf8",
  );
  const hook = readFileSync(
    join(root, "src/lib/hooks/useAvisoToast.ts"),
    "utf8",
  );

  it("el toast no habla de push ni de avisos activos del celular", () => {
    for (const src of [pedidos, espera, hook]) {
      expect(src).not.toContain("avisos activos");
      expect(src).not.toContain("no alerts on");
    }
    expect(hook).toContain("Avisado 🔔");
    expect(hook).toContain("No se pudo avisar al cliente");
  });

  it("ambos paneles pasan visto_en al toast, no solo delivered", () => {
    expect(pedidos).toContain("toastAviso(res.notify, seenAt)");
    expect(pedidos).toContain("toastAviso(await notifyCustomer({ orderId: id }), seenAt)");
    expect(espera).toContain("toastAviso(r, seenAt)");
    expect(espera).toMatch(/const seenAt = esperaById\.get\(id\)\?\.seenAt/);
  });
});

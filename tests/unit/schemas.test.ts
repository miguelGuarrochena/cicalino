import { describe, expect, it } from "vitest";
import {
  branchConfigSchema,
  crearOrganizacionSchema,
  empleadoSchema,
  nuevoPedidoSchema,
  parsear,
  pushSubscribeSchema,
  qrTokenSchema,
  solicitudSchema,
  transicionValida,
} from "@/lib/schemas";

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("solicitudSchema (formulario público)", () => {
  it("acepta una solicitud válida y normaliza", () => {
    const r = parsear(solicitudSchema, {
      nombre: "  Miguel  ",
      email: "  MIGUEL@Ejemplo.COM ",
      local: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.nombre).toBe("Miguel");
      expect(r.data.email).toBe("miguel@ejemplo.com");
      expect(r.data.local).toBeUndefined();
    }
  });

  it("rechaza email inválido", () => {
    expect(parsear(solicitudSchema, { nombre: "Ana", email: "no-es-mail" }).ok)
      .toBe(false);
  });

  it("rechaza payloads gigantes", () => {
    const r = parsear(solicitudSchema, {
      nombre: "x".repeat(5000),
      email: "a@b.com",
    });
    expect(r.ok).toBe(false);
  });

  it("ignora campos de más (no hay mass-assignment)", () => {
    const r = parsear(solicitudSchema, {
      nombre: "Ana",
      email: "a@b.com",
      estado: "atendida",
      id: "inyectado",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect("estado" in r.data).toBe(false);
  });
});

describe("crearOrganizacionSchema", () => {
  const base = {
    nombre: "Café Central",
    responsable: "Miguel",
    duenoEmail: "dueno@ejemplo.com",
    cupo: 2,
    sucursales: [{ nombre: "Centro", tipo: "cafeteria" }],
  };

  it("acepta un alta válida y aplica defaults", () => {
    const r = parsear(crearOrganizacionSchema, base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.plan).toBe("mensual");
      expect(r.data.mesGratis).toBe(false);
    }
  });

  it("rechaza cupo fuera de rango", () => {
    expect(parsear(crearOrganizacionSchema, { ...base, cupo: 0 }).ok).toBe(false);
    expect(parsear(crearOrganizacionSchema, { ...base, cupo: 9999 }).ok).toBe(false);
  });

  it("rechaza un tipo de negocio inventado", () => {
    const r = parsear(crearOrganizacionSchema, {
      ...base,
      sucursales: [{ nombre: "Centro", tipo: "ferreteria" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza un plan inventado", () => {
    expect(parsear(crearOrganizacionSchema, { ...base, plan: "vitalicio" }).ok)
      .toBe(false);
  });

  it("normaliza el CUIL a 11 dígitos y rechaza los cortos", () => {
    const ok = parsear(crearOrganizacionSchema, { ...base, cuil: "20-12345678-9" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.cuil).toBe("20123456789");
    expect(parsear(crearOrganizacionSchema, { ...base, cuil: "123" }).ok).toBe(false);
  });
});

describe("branchConfigSchema", () => {
  const base = {
    nombre: "Mostrador",
    tipo: "cafeteria",
    whatsapp: "",
    direccion: "",
    modo: "pedido",
    cantidadMesas: 10,
    horaCorte: 6,
  };

  it("acepta config válida", () => {
    expect(parsear(branchConfigSchema, base).ok).toBe(true);
  });

  it("rechaza hora de corte fuera de 0-23", () => {
    expect(parsear(branchConfigSchema, { ...base, horaCorte: 24 }).ok).toBe(false);
    expect(parsear(branchConfigSchema, { ...base, horaCorte: -1 }).ok).toBe(false);
  });

  it("rechaza whatsapp con menos de 8 dígitos", () => {
    expect(parsear(branchConfigSchema, { ...base, whatsapp: "123" }).ok).toBe(false);
  });
});

describe("empleadoSchema", () => {
  it("acepta PIN de 4 dígitos y lo normaliza", () => {
    const r = parsear(empleadoSchema, { nombre: "Sofía", pin: "12-34" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.pin).toBe("1234");
  });

  it("rechaza PIN de largo distinto de 4", () => {
    expect(parsear(empleadoSchema, { nombre: "Sofía", pin: "123" }).ok).toBe(false);
    expect(parsear(empleadoSchema, { nombre: "Sofía", pin: "123456" }).ok).toBe(false);
  });

  it("acepta empleado sin PIN", () => {
    expect(parsear(empleadoSchema, { nombre: "Sofía" }).ok).toBe(true);
  });
});

describe("nuevoPedidoSchema", () => {
  it("acepta un pedido válido", () => {
    expect(parsear(nuevoPedidoSchema, { branchId: UUID, reference: "42" }).ok)
      .toBe(true);
  });

  it("rechaza branchId que no es UUID", () => {
    expect(parsear(nuevoPedidoSchema, { branchId: "suc-centro", reference: "42" }).ok)
      .toBe(false);
  });

  it("rechaza referencia vacía o gigante", () => {
    expect(parsear(nuevoPedidoSchema, { branchId: UUID, reference: "  " }).ok)
      .toBe(false);
    expect(
      parsear(nuevoPedidoSchema, { branchId: UUID, reference: "x".repeat(200) }).ok,
    ).toBe(false);
  });
});

describe("transicionValida", () => {
  it("permite el flujo operativo", () => {
    expect(transicionValida("creado", "listo")).toBe(true);
    expect(transicionValida("creado", "en_preparacion")).toBe(true);
    expect(transicionValida("listo", "retirado")).toBe(true);
    expect(transicionValida("creado", "cancelado")).toBe(true);
  });

  it("no deja saltear ni retroceder", () => {
    expect(transicionValida("creado", "retirado")).toBe(false);
    expect(transicionValida("retirado", "listo")).toBe(false);
    expect(transicionValida("cancelado", "listo")).toBe(false);
    expect(transicionValida("retirado", "cancelado")).toBe(false);
  });
});

describe("pushSubscribeSchema (anti-SSRF)", () => {
  const conEndpoint = (endpoint: string) => ({
    token: UUID,
    subscription: { endpoint, keys: { p256dh: "abc", auth: "def" } },
  });

  it("acepta endpoints de servicios de push reales", () => {
    expect(parsear(pushSubscribeSchema, conEndpoint("https://fcm.googleapis.com/fcm/send/xyz")).ok).toBe(true);
    expect(parsear(pushSubscribeSchema, conEndpoint("https://web.push.apple.com/abc")).ok).toBe(true);
    expect(parsear(pushSubscribeSchema, conEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).ok).toBe(true);
  });

  it("rechaza hosts arbitrarios y red interna", () => {
    expect(parsear(pushSubscribeSchema, conEndpoint("https://atacante.com/x")).ok).toBe(false);
    expect(parsear(pushSubscribeSchema, conEndpoint("http://169.254.169.254/latest/meta-data/")).ok).toBe(false);
    expect(parsear(pushSubscribeSchema, conEndpoint("https://localhost:3000/x")).ok).toBe(false);
    expect(parsear(pushSubscribeSchema, conEndpoint("file:///etc/passwd")).ok).toBe(false);
  });

  it("no se deja engañar por un sufijo parecido", () => {
    expect(parsear(pushSubscribeSchema, conEndpoint("https://fcm.googleapis.com.atacante.com/x")).ok).toBe(false);
  });

  it("exige que el token del QR sea UUID", () => {
    const r = parsear(pushSubscribeSchema, {
      token: "tok-42",
      subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/xyz" },
    });
    expect(r.ok).toBe(false);
  });
});

describe("qrTokenSchema", () => {
  it("acepta UUID y rechaza el resto", () => {
    expect(qrTokenSchema.safeParse(UUID).success).toBe(true);
    expect(qrTokenSchema.safeParse("demo-token").success).toBe(false);
    expect(qrTokenSchema.safeParse("' or 1=1--").success).toBe(false);
  });
});

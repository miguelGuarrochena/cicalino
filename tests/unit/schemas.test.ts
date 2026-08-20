import { describe, expect, it } from "vitest";
import {
  branchConfigSchema,
  createOrganizationSchema,
  employeeSchema,
  newOrderSchema,
  parseInput,
  pushSubscribeSchema,
  qrTokenSchema,
  leadSchema,
  isValidTransition,
  orderTransitionSources,
} from "@/lib/schemas";

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("solicitudSchema (formulario público)", () => {
  it("acepta una solicitud válida y normaliza", () => {
    const r = parseInput(leadSchema, {
      name: "  Miguel  ",
      email: "  MIGUEL@Ejemplo.COM ",
      local: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("Miguel");
      expect(r.data.email).toBe("miguel@ejemplo.com");
      expect(r.data.local).toBeUndefined();
    }
  });

  it("rechaza email inválido", () => {
    expect(parseInput(leadSchema, { name: "Ana", email: "no-es-mail" }).ok)
      .toBe(false);
  });

  it("rechaza payloads gigantes", () => {
    const r = parseInput(leadSchema, {
      name: "x".repeat(5000),
      email: "a@b.com",
    });
    expect(r.ok).toBe(false);
  });

  it("ignora campos de más (no hay mass-assignment)", () => {
    const r = parseInput(leadSchema, {
      name: "Ana",
      email: "a@b.com",
      status: "atendida",
      id: "inyectado",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect("estado" in r.data).toBe(false);
  });

  it("acepta contrato completo y rechaza contrato incompleto", () => {
    const ok = parseInput(leadSchema, {
      name: "Ana",
      email: "a@b.com",
      telefono: "+54 9 11 5555 5555",
      local: "Café Ana",
      direccion: "Av. Corrientes 1234",
      tipo: "contrato",
      plan: "anual",
      pack: "pack",
      cuil: "20-12345678-9",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.data.tipo).toBe("contrato");
      expect(ok.data.plan).toBe("anual");
      expect(ok.data.pack).toBe("pack");
      expect(ok.data.cuil).toBe("20123456789");
      expect(ok.data.telefono).toContain("11");
    }
    expect(
      parseInput(leadSchema, {
        name: "Ana",
        email: "a@b.com",
        tipo: "contrato",
      }).ok,
    ).toBe(false);
    expect(
      parseInput(leadSchema, {
        name: "Ana",
        email: "a@b.com",
        local: "Café",
        telefono: "1155555555",
        tipo: "contrato",
        plan: "mensual",
      }).ok,
    ).toBe(false);
  });
});

describe("crearOrganizacionSchema", () => {
  const base = {
    name: "Café Central",
    responsable: "Miguel",
    ownerEmail: "dueno@ejemplo.com",
    cupo: 2,
    sucursales: [{ name: "Centro", tipo: "cafeteria" }],
  };

  it("acepta un alta válida y aplica defaults", () => {
    const r = parseInput(createOrganizationSchema, base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.plan).toBe("mensual");
      expect(r.data.mesGratis).toBe(false);
    }
  });

  it("rechaza cupo fuera de rango", () => {
    expect(parseInput(createOrganizationSchema, { ...base, cupo: 0 }).ok).toBe(false);
    expect(parseInput(createOrganizationSchema, { ...base, cupo: 9999 }).ok).toBe(false);
  });

  it("rechaza un tipo de negocio inventado", () => {
    const r = parseInput(createOrganizationSchema, {
      ...base,
      sucursales: [{ name: "Centro", tipo: "ferreteria" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza un plan inventado", () => {
    expect(parseInput(createOrganizationSchema, { ...base, plan: "vitalicio" }).ok)
      .toBe(false);
  });

  it("normaliza el CUIL a 11 dígitos y rechaza los cortos", () => {
    const ok = parseInput(createOrganizationSchema, { ...base, cuil: "20-12345678-9" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.cuil).toBe("20123456789");
    expect(parseInput(createOrganizationSchema, { ...base, cuil: "123" }).ok).toBe(false);
  });
});

describe("branchConfigSchema", () => {
  const base = {
    name: "Mostrador",
    tipo: "cafeteria",
    whatsapp: "",
    direccion: "",
    modo: "pedido",
    tableCount: 10,
    cutoffHour: 6,
    /* Estos tres no tienen default en branchConfigSchema (sí en
     * branchOperacionSchema): omitirlos hace fallar el parseo. */
    reservaAbreMin: 660,
    reservaCierraMin: 1380,
    diasCerrados: [] as number[],
  };

  it("acepta config válida", () => {
    expect(parseInput(branchConfigSchema, base).ok).toBe(true);
  });

  it("rechaza hora de corte fuera de 0-23", () => {
    expect(parseInput(branchConfigSchema, { ...base, cutoffHour: 24 }).ok).toBe(false);
    expect(parseInput(branchConfigSchema, { ...base, cutoffHour: -1 }).ok).toBe(false);
  });

  it("rechaza whatsapp con menos de 8 dígitos", () => {
    expect(parseInput(branchConfigSchema, { ...base, whatsapp: "123" }).ok).toBe(false);
  });

  it("rechaza la apertura después del cierre", () => {
    expect(
      parseInput(branchConfigSchema, {
        ...base,
        reservaAbreMin: 1380,
        reservaCierraMin: 660,
      }).ok,
    ).toBe(false);
  });

  it("rechaza cerrar los siete días", () => {
    expect(
      parseInput(branchConfigSchema, {
        ...base,
        diasCerrados: [0, 1, 2, 3, 4, 5, 6],
      }).ok,
    ).toBe(false);
  });
});

describe("empleadoSchema", () => {
  it("acepta PIN de 4 dígitos y lo normaliza", () => {
    const r = parseInput(employeeSchema, { name: "Sofía", pin: "12-34" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.pin).toBe("1234");
  });

  it("rechaza PIN de largo distinto de 4", () => {
    expect(parseInput(employeeSchema, { name: "Sofía", pin: "123" }).ok).toBe(false);
    expect(parseInput(employeeSchema, { name: "Sofía", pin: "123456" }).ok).toBe(false);
  });

  it("acepta empleado sin PIN", () => {
    expect(parseInput(employeeSchema, { name: "Sofía" }).ok).toBe(true);
  });
});

describe("nuevoPedidoSchema", () => {
  it("acepta un pedido válido", () => {
    expect(parseInput(newOrderSchema, { branchId: UUID, reference: "42" }).ok)
      .toBe(true);
  });

  it("rechaza branchId que no es UUID", () => {
    expect(parseInput(newOrderSchema, { branchId: "suc-centro", reference: "42" }).ok)
      .toBe(false);
  });

  it("rechaza referencia vacía o gigante", () => {
    expect(parseInput(newOrderSchema, { branchId: UUID, reference: "  " }).ok)
      .toBe(false);
    expect(
      parseInput(newOrderSchema, { branchId: UUID, reference: "x".repeat(200) }).ok,
    ).toBe(false);
  });

  it("acepta reference null (asignación atómica en el RPC)", () => {
    expect(parseInput(newOrderSchema, { branchId: UUID, reference: null }).ok)
      .toBe(true);
    expect(parseInput(newOrderSchema, { branchId: UUID }).ok).toBe(true);
  });
});

describe("transicionValida", () => {
  it("permite el flujo operativo", () => {
    expect(isValidTransition("creado", "listo")).toBe(true);
    expect(isValidTransition("creado", "en_preparacion")).toBe(true);
    expect(isValidTransition("listo", "retirado")).toBe(true);
    expect(isValidTransition("creado", "cancelado")).toBe(true);
  });

  it("no deja saltear ni retroceder", () => {
    expect(isValidTransition("creado", "retirado")).toBe(false);
    expect(isValidTransition("retirado", "listo")).toBe(false);
    expect(isValidTransition("cancelado", "listo")).toBe(false);
    expect(isValidTransition("retirado", "cancelado")).toBe(false);
  });

  it("a listo se llega desde creado o en_preparacion", () => {
    expect(orderTransitionSources("listo").sort()).toEqual([
      "creado",
      "en_preparacion",
    ]);
  });

  it("retirado y cancelado no tienen orígenes hacia atrás", () => {
    expect(orderTransitionSources("creado")).toEqual([]);
    expect(orderTransitionSources("retirado").sort()).toEqual(["listo"]);
    expect(orderTransitionSources("cancelado").sort()).toEqual([
      "creado",
      "en_preparacion",
      "listo",
    ]);
  });
});

describe("pushSubscribeSchema (anti-SSRF)", () => {
  const conEndpoint = (endpoint: string) => ({
    token: UUID,
    subscription: {
      endpoint,
      keys: { p256dh: "BPabcdefghijklmnopqrstuv", auth: "authkey12" },
    },
  });

  it("acepta endpoints de servicios de push reales", () => {
    expect(parseInput(pushSubscribeSchema, conEndpoint("https://fcm.googleapis.com/fcm/send/xyz")).ok).toBe(true);
    expect(parseInput(pushSubscribeSchema, conEndpoint("https://web.push.apple.com/abc")).ok).toBe(true);
    expect(parseInput(pushSubscribeSchema, conEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).ok).toBe(true);
  });

  it("rechaza hosts arbitrarios y red interna", () => {
    expect(parseInput(pushSubscribeSchema, conEndpoint("https://atacante.com/x")).ok).toBe(false);
    expect(parseInput(pushSubscribeSchema, conEndpoint("http://169.254.169.254/latest/meta-data/")).ok).toBe(false);
    expect(parseInput(pushSubscribeSchema, conEndpoint("https://localhost:3000/x")).ok).toBe(false);
    expect(parseInput(pushSubscribeSchema, conEndpoint("file:///etc/passwd")).ok).toBe(false);
  });

  it("no se deja engañar por un sufijo parecido", () => {
    expect(parseInput(pushSubscribeSchema, conEndpoint("https://fcm.googleapis.com.atacante.com/x")).ok).toBe(false);
  });

  it("exige que el token del QR sea UUID", () => {
    const r = parseInput(pushSubscribeSchema, {
      token: "tok-42",
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/xyz",
        keys: { p256dh: "BPabcdefghijklmnopqrstuv", auth: "authkey12" },
      },
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

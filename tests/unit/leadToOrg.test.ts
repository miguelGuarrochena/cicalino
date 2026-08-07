import { describe, it, expect } from "vitest";
import { leadToOrgPayload, type LeadRow } from "@/lib/leadToOrg";
import { createOrganizationSchema, parseInput } from "@/lib/schemas";

const mkLead = (over: Partial<LeadRow> = {}): LeadRow => ({
  nombre: "Juan Pérez",
  email: "Juan@Ejemplo.com ",
  telefono: "11 5555 4444",
  local: "Panadería La Esquina",
  ciudad: "Rosario",
  direccion: "Calle Falsa 742",
  cuil: "20-12345678-9",
  tipo: "prueba",
  plan: null,
  pack: null,
  ...over,
});

/* Este es el test que faltaba: el payload viajaba con claves en castellano
 * (`nombre`) contra un schema que las espera en inglés (`name`), así que
 * activar una solicitud fallaba siempre. */
describe("leadToOrgPayload: el alta pasa la validación", () => {
  it("una solicitud de prueba produce un payload válido", () => {
    const r = parseInput(createOrganizationSchema, leadToOrgPayload(mkLead()));
    expect(r.ok).toBe(true);
  });

  it("una solicitud de contrato produce un payload válido", () => {
    const r = parseInput(
      createOrganizationSchema,
      leadToOrgPayload(mkLead({ tipo: "contrato", plan: "anual", pack: "pack" })),
    );
    expect(r.ok).toBe(true);
  });

  it("sigue siendo válido con los campos opcionales vacíos", () => {
    const r = parseInput(
      createOrganizationSchema,
      leadToOrgPayload({
        nombre: "Ana",
        email: "ana@ejemplo.com",
        telefono: null,
        local: null,
        ciudad: null,
        direccion: null,
        cuil: null,
        tipo: "prueba",
      }),
    );
    expect(r.ok).toBe(true);
  });
});

describe("leadToOrgPayload: mapeo de campos", () => {
  it("usa el nombre del local como razón social y al solicitante como responsable", () => {
    const p = leadToOrgPayload(mkLead());
    expect(p.name).toBe("Panadería La Esquina");
    expect(p.responsable).toBe("Juan Pérez");
    expect(p.sucursales?.[0]?.name).toBe("Panadería La Esquina");
  });

  it("cae al nombre de la persona si no dio nombre de local", () => {
    const p = leadToOrgPayload(mkLead({ local: null }));
    expect(p.name).toBe("Juan Pérez");
    expect(p.sucursales?.[0]?.name).toBe("Principal");
  });

  it("normaliza el email a minúsculas y sin espacios", () => {
    expect(leadToOrgPayload(mkLead()).ownerEmail).toBe("juan@ejemplo.com");
  });

  it("deja el CUIL en 11 dígitos, o vacío si no es válido", () => {
    expect(leadToOrgPayload(mkLead()).cuil).toBe("20123456789");
    expect(leadToOrgPayload(mkLead({ cuil: "123" })).cuil).toBe("");
    expect(leadToOrgPayload(mkLead({ cuil: null })).cuil).toBe("");
  });

  it("usa la ciudad como dirección cuando no hay dirección", () => {
    expect(leadToOrgPayload(mkLead({ direccion: null })).direccion).toBe("Rosario");
  });
});

describe("leadToOrgPayload: reglas de negocio", () => {
  it("una prueba da mes gratis, plan mensual y sólo el módulo de pedidos", () => {
    const p = leadToOrgPayload(mkLead({ tipo: "prueba", plan: "anual", pack: "pack" }));
    expect(p.mesGratis).toBe(true);
    expect(p.plan).toBe("mensual");
    expect(p.moduloPedidos).toBe(true);
    expect(p.moduloEspera).toBe(false);
  });

  it("un contrato respeta el plan y el pack elegidos, sin mes gratis", () => {
    const p = leadToOrgPayload(mkLead({ tipo: "contrato", plan: "anual", pack: "espera" }));
    expect(p.mesGratis).toBe(false);
    expect(p.plan).toBe("anual");
    expect(p.moduloPedidos).toBe(false);
    expect(p.moduloEspera).toBe(true);
  });

  it("el pack combinado habilita los dos módulos", () => {
    const p = leadToOrgPayload(mkLead({ tipo: "contrato", plan: "mensual", pack: "pack" }));
    expect(p.moduloPedidos).toBe(true);
    expect(p.moduloEspera).toBe(true);
  });

  it("un plan o pack basura cae a los valores por defecto", () => {
    const p = leadToOrgPayload(
      mkLead({ tipo: "contrato", plan: "vitalicio", pack: "todo" }),
    );
    expect(p.plan).toBe("mensual");
    expect(p.moduloPedidos).toBe(true);
    expect(p.moduloEspera).toBe(false);
    expect(parseInput(createOrganizationSchema, p).ok).toBe(true);
  });

  it("la sucursal hereda los módulos de la organización", () => {
    const p = leadToOrgPayload(mkLead({ tipo: "contrato", plan: "mensual", pack: "espera" }));
    expect(p.sucursales?.[0]?.moduloPedidos).toBe(p.moduloPedidos);
    expect(p.sucursales?.[0]?.moduloEspera).toBe(p.moduloEspera);
  });

  it("el alta siempre arranca con cupo 1", () => {
    expect(leadToOrgPayload(mkLead()).cupo).toBe(1);
  });
});

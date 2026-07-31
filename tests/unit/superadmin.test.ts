import { describe, it, expect } from "vitest";
import {
  monthlyCharge,
  upcomingCharge,
  orgById,
  branchById,
  PRICE_PER_BRANCH,
  monthlyPriceForBranch,
  type OrganizationRow,
} from "@/lib/store/superadmin-store";
import { PRICE_BUNDLE } from "@/lib/pricing";

const mkOrg = (over: Partial<OrganizationRow> = {}): OrganizationRow => ({
  id: "o1",
  nombre: "Org",
  responsable: "R",
  telefono: "+54 9 11 5555 5555",
  cuil: "30-71234567-8",
  direccion: "",
  ownerEmail: "d@x.com",
  cupo: 2,
  pagado: true,
  activo: true,
  plan: "mensual",
  freeMonthUntil: null,
  nextChargeAt: null,
  contractAcceptedAt: "2026-01-01T00:00:00Z",
  moduloPedidos: true,
  moduloEspera: false,
  altaEn: "2026-01-01T00:00:00Z",
  sucursales: [
    {
      id: "s1",
      organizationId: "o1",
      nombre: "Centro",
      tipo: "panaderia",
      direccion: "",
      activo: true,
      pedidosHoy: 10,
      moduloPedidos: true,
      moduloEspera: false,
    },
  ],
  ...over,
});

describe("monthlyCharge", () => {
  it("cobra la suma de packs de cada sucursal", () => {
    expect(monthlyCharge(mkOrg())).toBe(PRICE_PER_BRANCH);
    expect(
      monthlyCharge(
        mkOrg({
          cupo: 2,
          sucursales: [
            {
              id: "s1",
              organizationId: "o1",
              nombre: "A",
              tipo: "panaderia",
              direccion: "",
              activo: true,
              pedidosHoy: 0,
              moduloPedidos: true,
              moduloEspera: false,
            },
            {
              id: "s2",
              organizationId: "o1",
              nombre: "B",
              tipo: "panaderia",
              direccion: "",
              activo: true,
              pedidosHoy: 0,
              moduloPedidos: true,
              moduloEspera: true,
            },
          ],
        }),
      ),
    ).toBe(PRICE_PER_BRANCH + PRICE_BUNDLE);
  });
  it("no cobra si está pausada, es gratis o en cortesía", () => {
    expect(monthlyCharge(mkOrg({ activo: false }))).toBe(0);
    expect(monthlyCharge(mkOrg({ plan: "gratis" }))).toBe(0);
    const futuro = new Date(Date.now() + 5 * 86400000).toISOString();
    expect(monthlyCharge(mkOrg({ freeMonthUntil: futuro }))).toBe(0);
  });
});

describe("cobroProximo", () => {
  it("anual cobra 10 meses (2 de regalo)", () => {
    expect(upcomingCharge(mkOrg({ plan: "anual" }))).toBe(
      10 * PRICE_PER_BRANCH,
    );
  });
  it("mensual cobra 1 mes", () => {
    expect(upcomingCharge(mkOrg({ plan: "mensual" }))).toBe(
      PRICE_PER_BRANCH,
    );
  });
});

describe("precioMensualPorSucursal", () => {
  it("pack es más barato que sumar ambos", () => {
    expect(
      monthlyPriceForBranch({ pedidos: true, espera: true }),
    ).toBe(PRICE_BUNDLE);
  });
});

describe("orgById / branchById", () => {
  const orgs = [mkOrg({ id: "o1" })];
  it("encuentra la organización", () => {
    expect(orgById(orgs, "o1")?.id).toBe("o1");
    expect(orgById(orgs, "inexistente")).toBeUndefined();
    expect(orgById(orgs, null)).toBeUndefined();
  });
  it("encuentra la sucursal por id", () => {
    expect(branchById(orgs, "s1")?.nombre).toBe("Centro");
    expect(branchById(orgs, null)).toBeUndefined();
    expect(branchById(orgs, "nope")).toBeUndefined();
  });
});

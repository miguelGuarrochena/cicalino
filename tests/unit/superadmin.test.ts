import { describe, it, expect } from "vitest";
import {
  monthlyCharge,
  orgById,
  branchById,
  PRECIO_POR_SUCURSAL,
  type OrganizationRow,
} from "@/lib/store/superadmin-store";

const mkOrg = (over: Partial<OrganizationRow> = {}): OrganizationRow => ({
  id: "o1",
  nombre: "Org",
  responsable: "R",
  cuil: "30-71234567-8",
  direccion: "",
  duenoEmail: "d@x.com",
  cupo: 2,
  pagado: true,
  activo: true,
  altaEn: "2026-01-01T00:00:00Z",
  sucursales: [
    {
      id: "s1",
      organizacionId: "o1",
      nombre: "Centro",
      tipo: "panaderia",
      direccion: "",
      activo: true,
      pedidosHoy: 10,
    },
  ],
  ...over,
});

describe("monthlyCharge", () => {
  it("cobra cupo × precio si está paga y activa", () => {
    expect(monthlyCharge(mkOrg({ cupo: 2 }))).toBe(2 * PRECIO_POR_SUCURSAL);
    expect(monthlyCharge(mkOrg({ cupo: 3 }))).toBe(3 * PRECIO_POR_SUCURSAL);
  });
  it("no cobra si está impaga o inactiva", () => {
    expect(monthlyCharge(mkOrg({ pagado: false }))).toBe(0);
    expect(monthlyCharge(mkOrg({ activo: false }))).toBe(0);
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

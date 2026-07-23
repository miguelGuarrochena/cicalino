import { describe, it, expect } from "vitest";
import {
  cobroMensual,
  orgPorId,
  sucursalPorId,
  PRECIO_POR_SUCURSAL,
  type OrganizacionRow,
} from "@/lib/store/superadmin-store";

const mkOrg = (over: Partial<OrganizacionRow> = {}): OrganizacionRow => ({
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

describe("cobroMensual", () => {
  it("cobra cupo × precio si está paga y activa", () => {
    expect(cobroMensual(mkOrg({ cupo: 2 }))).toBe(2 * PRECIO_POR_SUCURSAL);
    expect(cobroMensual(mkOrg({ cupo: 3 }))).toBe(3 * PRECIO_POR_SUCURSAL);
  });
  it("no cobra si está impaga o inactiva", () => {
    expect(cobroMensual(mkOrg({ pagado: false }))).toBe(0);
    expect(cobroMensual(mkOrg({ activo: false }))).toBe(0);
  });
});

describe("orgPorId / sucursalPorId", () => {
  const orgs = [mkOrg({ id: "o1" })];
  it("encuentra la organización", () => {
    expect(orgPorId(orgs, "o1")?.id).toBe("o1");
    expect(orgPorId(orgs, "inexistente")).toBeUndefined();
    expect(orgPorId(orgs, null)).toBeUndefined();
  });
  it("encuentra la sucursal por id", () => {
    expect(sucursalPorId(orgs, "s1")?.nombre).toBe("Centro");
    expect(sucursalPorId(orgs, null)).toBeUndefined();
    expect(sucursalPorId(orgs, "nope")).toBeUndefined();
  });
});

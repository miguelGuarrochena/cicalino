import { describe, it, expect } from "vitest";
import {
  isEmail,
  isCuil,
  formatCuil,
  isWhatsapp,
  isPin4,
  isEmployeeNameTaken,
  normalizeEmployeeName,
} from "@/lib/validations";

describe("isEmail", () => {
  it("acepta emails válidos", () => {
    expect(isEmail("hola@cicalino.ar")).toBe(true);
    expect(isEmail("  dueno@local.com  ")).toBe(true);
  });
  it("rechaza inválidos", () => {
    expect(isEmail("hola@")).toBe(false);
    expect(isEmail("sin-arroba.com")).toBe(false);
    expect(isEmail("")).toBe(false);
  });
});

describe("isCuil / formatCuil", () => {
  it("valida 11 dígitos", () => {
    expect(isCuil("30-71234567-8")).toBe(true);
    expect(isCuil("30712345678")).toBe(true);
    expect(isCuil("123")).toBe(false);
  });
  it("formatea con guiones", () => {
    expect(formatCuil("30712345678")).toBe("30-71234567-8");
    expect(formatCuil("30")).toBe("30");
    expect(formatCuil("307")).toBe("30-7");
  });
});

describe("isWhatsapp", () => {
  it("es opcional (vacío = válido)", () => {
    expect(isWhatsapp("")).toBe(true);
    expect(isWhatsapp("   ")).toBe(true);
  });
  it("pide al menos 8 dígitos", () => {
    expect(isWhatsapp("+54 9 341 555 1234")).toBe(true);
    expect(isWhatsapp("12345")).toBe(false);
  });
});

describe("isPin4", () => {
  it("exige 4 dígitos exactos", () => {
    expect(isPin4("1234")).toBe(true);
    expect(isPin4("12")).toBe(false);
    expect(isPin4("12345")).toBe(false);
    expect(isPin4("12a4")).toBe(false);
  });
});

describe("nombreEmpleadoEnUso", () => {
  const lista = [
    { id: "1", name: "Lucía" },
    { id: "2", name: "Marcos" },
  ];

  it("detecta el mismo nombre sin importar mayúsculas ni espacios", () => {
    expect(isEmployeeNameTaken("lucía", lista)).toBe(true);
    expect(isEmployeeNameTaken("  Lucía  ", lista)).toBe(true);
    expect(isEmployeeNameTaken("LUCÍA", lista)).toBe(true);
  });

  it("permite variantes distintas", () => {
    expect(isEmployeeNameTaken("Lucy", lista)).toBe(false);
    expect(isEmployeeNameTaken("Lucía B", lista)).toBe(false);
    expect(isEmployeeNameTaken("Luli", lista)).toBe(false);
  });

  it("ignora un id al editar", () => {
    expect(isEmployeeNameTaken("Lucía", lista, "1")).toBe(false);
    expect(isEmployeeNameTaken("Lucía", lista, "2")).toBe(true);
  });

  it("normaliza espacios internos", () => {
    expect(normalizeEmployeeName("  Lucía   B  ")).toBe("lucía b");
  });
});

// El chequeo de PIN duplicado se movió a la base (`set_empleado_pin`): el
// cliente ya no conoce los PINs, así que no se puede testear acá.

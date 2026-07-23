import { describe, it, expect } from "vitest";
import {
  isEmail,
  isCuil,
  formatCuil,
  isWhatsapp,
  isPin4,
  pinEnUso,
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

describe("pinEnUso", () => {
  const emps = [
    { id: "a", pin: "1111" },
    { id: "b", pin: "2222" },
  ];
  it("detecta PIN repetido", () => {
    expect(pinEnUso("1111", emps)).toBe(true);
    expect(pinEnUso("9999", emps)).toBe(false);
  });
  it("ignora al propio empleado", () => {
    expect(pinEnUso("1111", emps, "a")).toBe(false);
    expect(pinEnUso("1111", emps, "b")).toBe(true);
  });
  it("PIN vacío no está en uso", () => {
    expect(pinEnUso("", emps)).toBe(false);
  });
});

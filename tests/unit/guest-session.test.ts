import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { guestRestoreSchema } from "@/lib/schemas";
import {
  clearGuestCred,
  guestSessionHere,
  guestStorageKey,
  loadGuestCred,
  saveGuestCred,
} from "@/lib/guestSession";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const tableId = "11111111-1111-1111-1111-111111111111";

describe("Sesión del comensal al volver a escanear", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("restaura solo si la cuenta sigue abierta en esa mesa", () => {
    const abierta = { status: "abierta", tableId };
    expect(guestSessionHere(abierta, tableId)).toBe(true);
    expect(guestSessionHere({ status: "pagada", tableId }, tableId)).toBe(false);
    expect(guestSessionHere({ status: "cerrada", tableId }, tableId)).toBe(false);
    expect(guestSessionHere(abierta, "22222222-2222-2222-2222-222222222222")).toBe(
      false,
    );
    expect(guestSessionHere({ status: "abierta", tableId: null }, tableId)).toBe(
      false,
    );
    expect(guestSessionHere(null, tableId)).toBe(false);
  });

  it("guarda y lee la credencial por token de mesa", () => {
    const token = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const cred =
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
    expect(guestStorageKey(token)).toBe(`cicalino_mesa:${token}`);
    expect(loadGuestCred(token)).toBeNull();
    saveGuestCred(token, cred);
    expect(loadGuestCred(token)).toBe(cred);
    expect(loadGuestCred("cccccccc-cccc-cccc-cccc-cccccccccccc")).toBeNull();
    clearGuestCred(token);
    expect(loadGuestCred(token)).toBeNull();
  });

  it("el body de restaurar es guestId.secret", () => {
    const cred =
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
    expect(guestRestoreSchema.safeParse({ cred }).success).toBe(true);
    expect(guestRestoreSchema.safeParse({ cred: "no" }).success).toBe(false);
    expect(guestRestoreSchema.safeParse({}).success).toBe(false);
  });

  it("unirse pega la cookie en la respuesta y el cliente puede restaurar", () => {
    const unirse = read("src/app/api/m/[token]/unirse/route.ts");
    expect(unirse).toContain("attachGuestCookie");
    expect(unirse).toContain("cred:");
    expect(unirse).not.toContain("cookies()).set");

    const page = read("src/app/(customer)/m/[token]/page.tsx");
    expect(page).toContain("guestSessionHere");
    expect(page).toMatch(/const here =\s*state\.ok && guestSessionHere/);

    const app = read("src/components/customer/table/TableGuestApp.tsx");
    expect(app).toContain("/api/m/${token}/restaurar");
    expect(app).toContain("saveGuestCred");
    expect(app).toContain("loadGuestCred");

    expect(read("src/app/api/m/[token]/restaurar/route.ts")).toContain(
      "mutating: true",
    );
  });
});

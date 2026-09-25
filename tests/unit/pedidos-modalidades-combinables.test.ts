/**
 * Modalidades de Pedidos: el mostrador funciona de UNA forma (tradicional o
 * QR) y Mesa va aparte. Válidas: tradicional · tradicional + Mesa · QR ·
 * QR + Mesa · Mesa. Tradicional + QR no existe.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parsePedidosModalidad,
  pedidosEnMesa,
  pedidosMostradorQr,
  pedidosTradicional,
  validPedidosConfig,
  type PedidosModalidad,
} from "@/lib/modules";
import { branchOperacionSchema, pedidosModalidad } from "@/lib/schemas";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const pedidos = { pedidos: true };

const VALIDAS: { nombre: string; modalidad: PedidosModalidad; mesa: boolean }[] = [
  { nombre: "Tradicional", modalidad: "mostrador", mesa: false },
  { nombre: "Tradicional + Mesa", modalidad: "mostrador", mesa: true },
  { nombre: "QR", modalidad: "mostrador_qr", mesa: false },
  { nombre: "QR + Mesa", modalidad: "mostrador_qr", mesa: true },
  { nombre: "Mesa", modalidad: "sin_mostrador", mesa: true },
];

const base = {
  modo: "pedido",
  tableCount: 10,
  cutoffHour: 6,
  reservaAbreMin: 660,
  reservaCierraMin: 1380,
  diasCerrados: [],
};

describe("las cinco combinaciones válidas", () => {
  for (const c of VALIDAS) {
    it(`${c.nombre}: válida, se guarda y prende exactamente lo suyo`, () => {
      expect(validPedidosConfig(c.modalidad, c.mesa)).toBe(true);
      expect(
        branchOperacionSchema.safeParse({ ...base, pedidosModalidad: c.modalidad, pedidosMesa: c.mesa })
          .success,
      ).toBe(true);
      const tradicional = pedidosTradicional(pedidos, c.modalidad);
      const qr = pedidosMostradorQr(pedidos, c.modalidad);
      expect(tradicional).toBe(c.modalidad === "mostrador");
      expect(qr).toBe(c.modalidad === "mostrador_qr");
      expect(pedidosEnMesa(pedidos, c.mesa)).toBe(c.mesa);
      expect(tradicional && qr).toBe(false);
    });
  }

  it("son todas las que hay: 3 formas de mostrador × Mesa, menos «ninguna»", () => {
    const todas = pedidosModalidad.options.flatMap((m) =>
      [false, true].map((mesa) => ({ m, mesa, ok: validPedidosConfig(m, mesa) })),
    );
    expect(todas.filter((x) => x.ok)).toHaveLength(5);
    expect(todas.filter((x) => !x.ok)).toEqual([{ m: "sin_mostrador", mesa: false, ok: false }]);
  });
});

describe("lo que no se puede", () => {
  it("tradicional + QR no se puede expresar: el mostrador es un solo valor", () => {
    expect(pedidosModalidad.options).toEqual(["mostrador", "mostrador_qr", "sin_mostrador"]);
    for (const m of pedidosModalidad.options) {
      expect(pedidosTradicional(pedidos, m) && pedidosMostradorQr(pedidos, m)).toBe(false);
    }
    for (const valor of [["mostrador", "mostrador_qr"], "mostrador,mostrador_qr", "ambos"]) {
      expect(branchOperacionSchema.safeParse({ ...base, pedidosModalidad: valor }).success).toBe(false);
    }
  });

  it("sin mostrador y sin Mesa se rechaza", () => {
    expect(validPedidosConfig("sin_mostrador", false)).toBe(false);
    const r = branchOperacionSchema.safeParse({
      ...base,
      pedidosModalidad: "sin_mostrador",
      pedidosMesa: false,
    });
    expect(r.success).toBe(false);
  });

  it("el valor viejo «mesa» se lee como Mesa sola, pero ya no se guarda", () => {
    expect(parsePedidosModalidad("mesa")).toBe("sin_mostrador");
    expect(branchOperacionSchema.safeParse({ ...base, pedidosModalidad: "mesa" }).success).toBe(false);
    expect(read("src/lib/data/branch.ts")).toContain(
      'pedidosMesa: data.pedidos_mesa === true || data.pedidos_modalidad === "mesa"',
    );
  });

  it("sin el módulo Pedidos no hay ninguna", () => {
    expect(pedidosTradicional({ pedidos: false }, "mostrador")).toBe(false);
    expect(pedidosMostradorQr({ pedidos: false }, "mostrador_qr")).toBe(false);
    expect(pedidosEnMesa({ pedidos: false }, true)).toBe(false);
  });
});

describe("pedidos-modalidades-combinables.sql", () => {
  const sql = read("supabase/pedidos-modalidades-combinables.sql");

  it("Mesa pasa a su propia columna y el mostrador es un solo valor", () => {
    expect(sql).toContain("add column if not exists pedidos_mesa boolean not null default false");
    expect(sql).toContain("check (pedidos_modalidad in ('mostrador', 'mostrador_qr', 'sin_mostrador'))");
    expect(sql).toContain("check (pedidos_modalidad <> 'sin_mostrador' or pedidos_mesa)");
  });

  it("quien tenía Mesa la conserva, sin mostrador", () => {
    expect(sql).toMatch(/set pedidos_mesa = true,\s+pedidos_modalidad = 'sin_mostrador'\s+where pedidos_modalidad = 'mesa'/);
  });

  it("la lógica de Mesa y QR no cambia: solo de dónde lee Mesa", () => {
    expect(sql).toContain("coalesce((select l.pedidos_mesa from public.locales l where l.id = p_local), false)");
    expect(sql).not.toContain("function public.local_pedidos_mostrador_qr");
    expect(sql).not.toContain("function public.pedir_autoservicio");
    expect(sql).not.toContain("function public.pedir_mostrador_qr");
  });

  it("la carga del empleado solo anda en modo tradicional", () => {
    expect(sql).toContain("if not public.local_pedidos_tradicional(p_local) then");
    expect(sql).toContain("'mostrador-no-tradicional'");
    const orden = JSON.parse(read("supabase/orden.json")) as string[];
    expect(orden.at(-1)).toBe("pedidos-modalidades-combinables.sql");
  });
});

describe("Configuración y tablero", () => {
  it("el mostrador es una sola elección y Mesa un interruptor aparte", () => {
    const cfg = read("src/app/(app)/panel/config/page.tsx");
    expect(cfg).toContain('role="radiogroup"');
    expect(cfg).toContain('role="radio"');
    expect(cfg).toContain('role="switch"');
    expect(cfg).toContain('onClick={() => editar("pedidosMesa", !pedidosMesa)}');
    expect(cfg).toContain("const combinacionValida = validPedidosConfig(pedidosModalidad, pedidosMesa);");
    expect(cfg).toContain('next.combinacion = t("retiroConfig.errSinModalidad");');
  });

  it("«+ Nuevo pedido» solo con el mostrador tradicional", () => {
    const page = read("src/app/(app)/panel/pedidos/page.tsx");
    expect(page).toContain('const tradicional = useConfigStore((s) => s.pedidosModalidad === "mostrador");');
    expect(page).toContain("if (!tradicional) return;");
    expect(page).toContain("{tradicional && (");
    expect(page).toContain('href="/panel/pedidos/qr?de=mostrador"');
    expect(page).toContain('href="/panel/pedidos/qr?de=mesas"');
  });
});

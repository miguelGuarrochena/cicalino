import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(
  join(root, "supabase/dias-cerrados-jornada.sql"),
  "utf8",
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);
const orden = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
) as string[];
const businessDay = readFileSync(join(root, "src/lib/businessDay.ts"), "utf8");

/* La base y el panel tienen que contar la misma jornada. Este archivo es el
 * lado de la base: si alguno de los dos cambia sin el otro, el panel muestra
 * una jornada y el cron termina otra. */

/* El cuerpo de una función de la migración, para no chequear sobre el archivo
 * entero y creer que algo está donde no está. */
const funcion = (nombre: string): string => {
  const i = sql.indexOf(`create or replace function public.${nombre}`);
  expect(i, `${nombre} en la migración`).toBeGreaterThan(-1);
  const j = sql.indexOf("\n$$;", i);
  return sql.slice(i, j);
};

describe("La jornada no cambia en un día cerrado", () => {
  it("jornada_inicio_corte pasa a recibir los días cerrados, y queda una sola", () => {
    expect(sql).toContain(
      "drop function if exists public.jornada_inicio_corte(integer);",
    );
    expect(sql).toMatch(
      /create or replace function public\.jornada_inicio_corte\(\s*\n\s*p_corte integer,\s*\n\s*p_cerrados integer\[\] default '\{\}'::integer\[\]/,
    );
  });

  it("retrocede hasta el último día abierto", () => {
    const f = funcion("jornada_inicio_corte");
    expect(f).toMatch(/extract\(dow from v_dia\)::int = any \(v_cerrados\)/);
    expect(f).toContain("v_dia := v_dia - 1;");
    /* Con los siete días cerrados el bucle no tiene dónde parar. */
    expect(f).toContain("v_cerrados := '{}'::integer[];");
  });

  it("el cierre es el corte del próximo día abierto", () => {
    const f = funcion("jornada_fin_corte");
    expect(f).toContain("v_dia := v_dia + 1;");
    expect(f).toContain("public.jornada_inicio_corte(v_corte, v_cerrados)");
  });

  it("los días se numeran igual que en el panel: 0 = domingo", () => {
    expect(sql).toContain("0 = domingo");
    expect(businessDay).toContain("0 = domingo");
  });

  it("ninguna de las dos es llamable desde el cliente", () => {
    expect(sql).toMatch(
      /revoke all on function public\.jornada_inicio_corte\(integer, integer\[\]\)\s*\n?\s*from public, anon, authenticated/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.jornada_inicio_local\(uuid\)\s*\n?\s*from public, anon, authenticated/,
    );
  });
});

describe("Lo que se reescribe para usarla", () => {
  it("el barrido del cron lee los días cerrados de cada sucursal", () => {
    const f = funcion("liberar_mesas_jornada()");
    expect(f).toContain("select id, hora_corte, dias_cerrados from public.locales");
    expect(f).toContain(
      "public.jornada_inicio_corte(r.hora_corte, r.dias_cerrados)",
    );
    /* Lo de siempre: libera mesas, no toca reservas. */
    expect(f).toContain("estado = 'ocupada'");
    expect(f).not.toMatch(/update public\.reservas/i);
  });

  it("el barrido del panel sigue chequeando acceso", () => {
    const f = funcion("liberar_mesas_jornada_local(p_local uuid)");
    expect(f).toContain("puede_ver_local(p_local)");
    expect(f).toContain("public.jornada_inicio_local(p_local)");
  });

  it("las cuentas de la sala y la plantilla miran la jornada de la sucursal", () => {
    expect(funcion("mesas_cuentas(p_local uuid)")).toContain(
      "v_desde := public.jornada_inicio_local(p_local);",
    );
    expect(funcion("jornada_fecha_local(p_local uuid)")).toContain(
      "public.jornada_inicio_local(p_local)",
    );
  });

  it("el alta de pedidos numera dentro de la jornada y mantiene el lock", () => {
    const f = funcion("crear_pedido(");
    expect(f).toContain("v_desde := public.jornada_inicio_corte(v_corte, v_cerrados);");
    expect(f).toContain("v_expira := public.jornada_fin_corte(v_corte, v_cerrados);");
    /* El `for update` es lo que evita dos pedidos con el mismo número. */
    expect(f).toContain("for update;");
    expect(f).toContain("creado_en >= v_desde");
  });

  it("la lista de pedidos sigue ignorando el p_desde del cliente", () => {
    const f = funcion("pedidos_pagina(");
    expect(f).toContain("v_desde := public.jornada_inicio_corte(v_corte, v_cerrados);");
    expect(f).toContain("creado_en >= v_desde");
    expect(f).not.toMatch(/creado_en >= p_desde/);
  });
});

describe("Registro de la migración", () => {
  it("está en el orden, después de todo lo que necesita", () => {
    expect(orden).toContain("dias-cerrados-jornada.sql");
    for (const dep of [
      "reservas-horario-local.sql",
      "liberar-mesas-jornada.sql",
      "mesa-asignacion-jornada.sql",
      "security-fixes-15.sql",
      "split-payments.sql",
      "mesa-qr-activo.sql",
    ]) {
      expect(
        orden.indexOf("dias-cerrados-jornada.sql"),
        dep,
      ).toBeGreaterThan(orden.indexOf(dep));
    }
  });

  it("el chequeo la busca por jornada_inicio_local", () => {
    expect(chequeo).toContain(
      "('dias-cerrados-jornada.sql', 'function', 'jornada_inicio_local', 83)",
    );
    expect(chequeo).toContain("('dias-cerrados-jornada.sql', 'reservas-horario-local.sql");
  });
});

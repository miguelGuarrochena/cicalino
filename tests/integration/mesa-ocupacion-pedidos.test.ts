/**
 * Ocupación de Recepción y pedidos por QR, contra las funciones reales.
 *
 *   RUN_MESA_SYNC_DB=1 RUN_DB_CHECKS=1 pnpm exec vitest run --config vitest.integration.config.ts tests/integration/mesa-ocupacion-pedidos.test.ts
 *
 * Cada caso aplica supabase/mesa-ocupacion-pedidos.sql dentro de la transacción
 * y termina en ROLLBACK: no deja la migración aplicada. Mientras corre toma
 * ACCESS EXCLUSIVE sobre mesa_sesiones y pedidos, así que no hay que lanzarlo
 * contra una base en servicio.
 *
 * El caso de dos conexiones también exige RUN_MESA_SYNC_DB=1: crea filas,
 * las commitea y las borra. No corre contra la base de producción.
 *
 * Solo contra Postgres en loopback. Si DATABASE_URL no es 127.0.0.1,
 * localhost o ::1, el archivo aborta antes de abrir una conexión. No lee
 * una URL remota de .env.local para conectarse: si esa es la única URL,
 * también aborta.
 *
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55422/postgres' PGSSL=0 pnpm db:sql
 *   PGSSL=0 RUN_DB_CHECKS=1 RUN_MESA_SYNC_DB=1 \
 *     pnpm exec vitest run --config vitest.integration.config.ts tests/integration/mesa-ocupacion-pedidos.test.ts
 *
 * El puerto 55422 es el Postgres local de Cicalino. 54322 es otro proyecto.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const loadEnvLocal = () => {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i);
    const v = line.slice(i + 1).replace(/^"|"$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
};
loadEnvLocal();

const loopbackHost = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    if (host === "127.0.0.1" || host === "localhost" || host === "::1") return host;
    return host;
  } catch {
    return null;
  }
};

const enabled = process.env.RUN_DB_CHECKS === "1" && process.env.RUN_MESA_SYNC_DB === "1";
if (enabled) {
  let host = loopbackHost(process.env.DATABASE_URL);
  let port = "";
  try {
    port = new URL(process.env.DATABASE_URL ?? "").port;
  } catch {
    host = null;
  }
  const local = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!local || port !== "55422") {
    throw new Error(
      `mesa-ocupacion-pedidos: no se abre conexión. DATABASE_URL host=${host ?? "inválido"} port=${port || "inválido"}. Solo 127.0.0.1:55422.`,
    );
  }
}
const lockEnabled = process.env.RUN_DB_CHECKS === "1" && process.env.RUN_MESA_SYNC_DB === "1";
const MARCA = "zz-mesa-sync";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const sqlFile = fs.readFileSync(
  path.join(process.cwd(), "supabase/mesa-ocupacion-pedidos.sql"),
  "utf8",
);

type Json = Record<string, unknown> & { ok?: boolean; reason?: string };

describe.skipIf(!enabled)("Integración — ocupación y pedidos por QR", () => {
  let client: pg.Client;
  let org: string;
  let admin: string;
  let ambos: string;
  let soloPedidos: string;
  let soloEspera: string;
  let otro: string;
  let producto: string;
  let productoPedidos: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("RUN_DB_CHECKS=1 requiere DATABASE_URL");
    client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false },
    });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  const q = async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows;
  const uno = async <T>(text: string, params: unknown[] = []) => (await q(text, params))[0] as T;
  const rpc = async (text: string, params: unknown[] = []) => (await uno<{ r: Json }>(text, params)).r;

  const como = async (role: "authenticated" | "service_role" | "anon", sub: string | null) => {
    await client.query("reset role");
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub, role: role === "anon" ? "anon" : role }),
    ]);
    await client.query(`set local role ${role}`);
  };
  const base = async () => client.query("reset role");

  const sucursal = async (
    o: string,
    nombre: string,
    flags: { espera: boolean; pedidos: boolean; pagos: boolean; mesa: boolean },
  ) =>
    (
      await uno<{ id: string }>(
        `insert into public.locales (
           organizacion_id, nombre, slug, activa,
           modulo_espera, modulo_pedidos, modulo_pagos, pedidos_modalidad, pedidos_mesa
         ) values ($1, $2, $3, true, $4, $5, $6, $8, $7) returning id`,
        [
          o,
          nombre,
          `${MARCA}-${nombre}-${crypto.randomUUID().slice(0, 8)}`,
          flags.espera,
          flags.pedidos,
          flags.pagos,
          flags.mesa,
          /* sin_mostrador exige pedidos_mesa. Recepción sola usa mostrador. */
          flags.mesa ? "sin_mostrador" : "mostrador",
        ],
      )
    ).id;

  const mesa = async (local: string, numero: number, qr = false) => {
    const row = await uno<{ id: string; token: string }>(
      `insert into public.mesas (local_id, numero, qr_activo)
       values ($1, $2, $3) returning id, qr_token token`,
      [local, numero, qr],
    );
    return row;
  };

  const sentar = async (local: string, numero: number, nombre = "Ana") => {
    await como("authenticated", admin);
    return rpc(`select public.sentar_walkin($1, $2, $3, 2, null, now() + interval '3 hours') r`, [
      local,
      [numero],
      nombre,
    ]);
  };

  const unirse = async (token: string, nombre = "Ana") => {
    await como("service_role", null);
    const secreto = crypto.randomUUID();
    const r = await rpc(`select public.unirse_mesa_autoservicio($1, $2, $3) r`, [
      token,
      nombre,
      sha(secreto),
    ]);
    return { r, hash: sha(secreto) };
  };

  const cobrar = async (pedidoId: string) => {
    await como("authenticated", admin);
    return rpc(`select public.cobrar_pedido_autoservicio($1, 'efectivo', null) r`, [pedidoId]);
  };

  const pedir = async (g: { r: Json; hash: string }, productoId = producto) => {
    await como("service_role", null);
    return rpc(`select public.pedir_autoservicio($1, $2, $3::jsonb, $4, 'caja') r`, [
      g.r.comensal_id,
      g.hash,
      JSON.stringify([{ producto_id: productoId, cantidad: 1 }]),
      crypto.randomUUID(),
    ]);
  };

  const estadoMesa = async (id: string) =>
    uno<{ estado: string; espera_id: string | null; reserva_id: string | null }>(
      `select estado, espera_id, reserva_id from public.mesas where id = $1`,
      [id],
    );

  const reservar = async (local: string, numero: number, cuando: string, estado = "activa") =>
    (
      await uno<{ id: string }>(
        `insert into public.reservas (
           local_id, nombre, personas, mesa_numero, mesas_numeros, horario, gracia_minutos, estado
         ) values ($1, 'Reserva', 2, $2, array[$2]::integer[], ${cuando}, 15, $3) returning id`,
        [local, numero, estado],
      )
    ).id;

  beforeEach(async () => {
    await client.query("begin");
    await client.query(sqlFile);
    await base();
    org = (
      await uno<{ id: string }>(
        `insert into public.organizaciones (nombre, dueno_email, activo, estado_suscripcion, modulo_espera, modulo_pedidos, modulo_pagos)
         values ($1, $2, true, 'active', true, true, true) returning id`,
        [`${MARCA} org`, `${MARCA}@test.invalid`],
      )
    ).id;
    admin = (
      await uno<{ id: string }>(
        `insert into auth.users (id, email, invited_at, raw_user_meta_data)
         values (gen_random_uuid(), $1, now(), $2::jsonb) returning id`,
        [`${MARCA}-admin-${crypto.randomUUID()}@test.invalid`, JSON.stringify({ rol: "admin", organizacion_id: org })],
      )
    ).id;
    ambos = await sucursal(org, "ambos", { espera: true, pedidos: true, pagos: false, mesa: true });
    soloPedidos = await sucursal(org, "pedidos", { espera: false, pedidos: true, pagos: false, mesa: true });
    soloEspera = await sucursal(org, "espera", { espera: true, pedidos: false, pagos: false, mesa: false });
    const otra = (
      await uno<{ id: string }>(
        `insert into public.organizaciones (nombre, dueno_email, activo, estado_suscripcion)
         values ($1, $2, true, 'active') returning id`,
        [`${MARCA} otra`, `${MARCA}-otra@test.invalid`],
      )
    ).id;
    otro = await sucursal(otra, "otro", { espera: false, pedidos: true, pagos: false, mesa: true });
    producto = (
      await uno<{ id: string }>(
        `insert into public.productos (local_id, nombre, precio) values ($1, 'Agua', 1500) returning id`,
        [ambos],
      )
    ).id;
    await q(`insert into public.local_cobros (local_id, acepta_efectivo) values ($1, true)`, [ambos]);
    productoPedidos = (
      await uno<{ id: string }>(
        `insert into public.productos (local_id, nombre, precio) values ($1, 'Agua', 1500) returning id`,
        [soloPedidos],
      )
    ).id;
    await q(`insert into public.local_cobros (local_id, acepta_efectivo) values ($1, true)`, [soloPedidos]);
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  it("1. solo Pedidos: el QR abre sesión con la mesa libre", async () => {
    const m = await mesa(soloPedidos, 4);
    expect((await uno<{ sync: boolean }>(`select public.mesa_sync_recepcion_pedidos($1) sync`, [soloPedidos])).sync).toBe(false);
    const u = await unirse(m.token);
    expect(u.r.ok).toBe(true);
    expect((await estadoMesa(m.id)).estado).toBe("libre");
    const pedido = await pedir(u, productoPedidos);
    expect(pedido.ok).toBe(true);
  });

  it("2. solo Recepción: sentar y liberar no piden una sesión", async () => {
    const m = await mesa(soloEspera, 2);
    const s = await sentar(soloEspera, 2);
    expect(s.ok).toBe(true);
    expect((await estadoMesa(m.id)).estado).toBe("ocupada");
    await como("service_role", null);
    const u = await rpc(`select public.unirse_mesa_autoservicio($1, 'Ana', $2) r`, [m.token, sha("x".repeat(8))]);
    expect(u.ok).toBe(false);
    expect(u.reason).toBe("not-available");
    await como("authenticated", admin);
    const lib = await rpc(`select public.liberar_mesas($1, 2, true) r`, [soloEspera]);
    expect(Number(lib.r ?? lib)).toBeGreaterThanOrEqual(0);
    expect((await estadoMesa(m.id)).estado).toBe("libre");
  });

  it("3. Recepción y Pedidos: una mesa libre no abre pedidos", async () => {
    const m = await mesa(ambos, 4);
    expect((await uno<{ sync: boolean }>(`select public.mesa_sync_recepcion_pedidos($1) sync`, [ambos])).sync).toBe(true);
    const u = await unirse(m.token);
    expect(u.r).toMatchObject({ ok: false, reason: "mesa-no-habilitada" });
  });

  it("4. apagar Recepción devuelve el QR al comportamiento de Pedidos", async () => {
    const m = await mesa(ambos, 6);
    await base();
    await q(`update public.locales set modulo_espera = false where id = $1`, [ambos]);
    const u = await unirse(m.token);
    expect(u.r.ok).toBe(true);
    await base();
    await q(`update public.locales set modulo_espera = true where id = $1`, [ambos]);
    const otraVez = await pedir(u);
    expect(otraVez).toMatchObject({ ok: false, reason: "mesa-liberada" });
  });

  it("5. un local sin Recepción no hereda la reserva de otro", async () => {
    const mia = await mesa(ambos, 8);
    const ajena = await mesa(otro, 8);
    await base();
    await reservar(ambos, 8, "now() + interval '10 minutes'");
    const bloqueada = await unirse(mia.token);
    expect(bloqueada.r.reason).toBe("mesa-reservada");
    const libre = await unirse(ajena.token);
    expect(libre.r.ok).toBe(true);
  });

  it("6. una reserva fuera de la ventana no impide sentar antes", async () => {
    const m = await mesa(ambos, 9);
    await base();
    await reservar(ambos, 9, "now() + interval '2 hours'");
    const u = await unirse(m.token);
    expect(u.r.reason).toBe("mesa-no-habilitada");
    const s = await sentar(ambos, 9);
    expect(s.ok).toBe(true);
    const despues = await unirse(m.token);
    expect(despues.r.ok).toBe(true);
  });

  it("7. a los 30 minutos la reserva bloquea sentar y el QR", async () => {
    const m = await mesa(ambos, 10);
    await base();
    await reservar(ambos, 10, "now() + interval '30 minutes'");
    expect((await unirse(m.token)).r.reason).toBe("mesa-reservada");
    const s = await sentar(ambos, 10);
    expect(s).toMatchObject({ ok: false, reason: "mesa-reservada" });
  });

  it("8. dentro de la ventana y sin sentar no hay pedidos", async () => {
    const m = await mesa(ambos, 11);
    await base();
    await reservar(ambos, 11, "now() + interval '10 minutes'");
    expect((await unirse(m.token)).r.reason).toBe("mesa-reservada");
    expect((await estadoMesa(m.id)).estado).toBe("libre");
  });

  it("9. durante la gracia la reserva sigue bloqueando", async () => {
    const m = await mesa(ambos, 12);
    await base();
    await reservar(ambos, 12, "now() - interval '10 minutes'");
    expect((await unirse(m.token)).r.reason).toBe("mesa-reservada");
  });

  it("10. cancelada o expirada no bloquea el salón", async () => {
    const m = await mesa(ambos, 13);
    await base();
    await reservar(ambos, 13, "now()", "cancelada");
    await reservar(ambos, 13, "now() + interval '1 day'", "expirada");
    expect((await unirse(m.token)).r.reason).toBe("mesa-no-habilitada");
    expect((await sentar(ambos, 13)).ok).toBe(true);
  });

  it("11. sentar la reserva ocupa la mesa y habilita esa ocupación", async () => {
    const m = await mesa(ambos, 14);
    await base();
    const reserva = await reservar(ambos, 14, "now()");
    await como("authenticated", admin);
    const s = await rpc(`select public.sentar_reserva($1, $2) r`, [ambos, reserva]);
    expect(s.ok).toBe(true);
    const mesaRow = await estadoMesa(m.id);
    expect(mesaRow).toMatchObject({ estado: "ocupada", reserva_id: reserva });
    const reservaRow = await uno<{ estado: string }>(`select estado from public.reservas where id = $1`, [reserva]);
    expect(reservaRow.estado).toBe("sentada");
    const u = await unirse(m.token);
    expect(u.r.ok).toBe(true);
    const sesion = await uno<{ ocupacion_reserva_id: string; acepta_pedidos: boolean }>(
      `select ocupacion_reserva_id, acepta_pedidos from public.mesa_sesiones where id = $1`,
      [u.r.sesion_id],
    );
    expect(sesion).toMatchObject({ ocupacion_reserva_id: reserva, acepta_pedidos: true });
    expect((await pedir(u)).ok).toBe(true);
  });

  it("12. la lista de espera ocupa la mesa y no acepta otro grupo", async () => {
    const m = await mesa(ambos, 15);
    await base();
    const espera = (
      await uno<{ id: string }>(
        `insert into public.esperas (local_id, nombre, personas, qr_token, qr_expira_en)
         values ($1, 'Luis', 2, gen_random_uuid()::text, now() + interval '2 hours') returning id`,
        [ambos],
      )
    ).id;
    await como("authenticated", admin);
    const s = await rpc(`select public.sentar_espera($1, $2, $3, false) r`, [ambos, espera, [15]]);
    expect(s.ok).toBe(true);
    expect((await estadoMesa(m.id)).espera_id).toBe(espera);
    expect((await uno<{ estado: string }>(`select estado from public.esperas where id = $1`, [espera])).estado).toBe("sentado");
    const u = await unirse(m.token);
    expect(u.r.ok).toBe(true);
    await como("authenticated", admin);
    const otra = (
      await uno<{ id: string }>(
        `insert into public.esperas (local_id, nombre, personas, qr_token, qr_expira_en)
         values ($1, 'Otra', 2, gen_random_uuid()::text, now() + interval '2 hours') returning id`,
        [ambos],
      )
    ).id;
    const segunda = await rpc(`select public.sentar_espera($1, $2, $3, false) r`, [ambos, otra, [15]]);
    expect(segunda).toMatchObject({ ok: false, reason: "mesa-no-disponible" });
  });

  it("13. un walk-in ocupa la mesa y puede pedir", async () => {
    const m = await mesa(ambos, 16);
    expect((await sentar(ambos, 16, "Nico")).ok).toBe(true);
    expect((await estadoMesa(m.id)).estado).toBe("ocupada");
    const u = await unirse(m.token);
    expect(u.r.ok).toBe(true);
    expect((await pedir(u)).ok).toBe(true);
  });

  it("14. libre y sin reserva: la mesa no está habilitada", async () => {
    const m = await mesa(ambos, 17);
    expect((await unirse(m.token)).r).toMatchObject({ ok: false, reason: "mesa-no-habilitada" });
  });

  it("15. ocupada con sesión válida: el segundo QR reutiliza esa sesión", async () => {
    const m = await mesa(ambos, 18);
    await sentar(ambos, 18);
    const a = await unirse(m.token, "Ana");
    const b = await unirse(m.token, "Luis");
    expect(a.r.ok && b.r.ok).toBe(true);
    expect(b.r.sesion_id).toBe(a.r.sesion_id);
    expect(b.r.sesion_nueva).toBe(false);
    expect((await pedir(b)).ok).toBe(true);
  });

  it("16. liberar sin consumos cierra la sesión y no borra su fila", async () => {
    const m = await mesa(ambos, 19);
    await sentar(ambos, 19);
    const u = await unirse(m.token);
    await como("authenticated", admin);
    await rpc(`select public.liberar_mesas($1, 19, true) r`, [ambos]);
    expect((await estadoMesa(m.id)).estado).toBe("libre");
    const sesion = await uno<{ estado: string; motivo: string | null; acepta: boolean }>(
      `select estado, cerrada_motivo motivo, acepta_pedidos acepta from public.mesa_sesiones where id = $1`,
      [u.r.sesion_id],
    );
    expect(sesion.estado).toBe("cerrada");
    expect(sesion.motivo).toBe("mesa-liberada");
    expect((await pedir(u)).reason).toBe("mesa-liberada");
  });

  it("17. liberar con un pedido pendiente conserva el pedido y corta los nuevos", async () => {
    const m = await mesa(ambos, 20);
    await sentar(ambos, 20);
    const u = await unirse(m.token);
    const hecho = await pedir(u);
    expect(hecho.ok).toBe(true);
    const antes = await uno<{ estado: string }>(`select estado from public.pedidos where id = $1`, [hecho.pedido_id]);
    await como("authenticated", admin);
    await rpc(`select public.liberar_mesas($1, 20, true) r`, [ambos]);
    const despues = await uno<{ estado: string }>(`select estado from public.pedidos where id = $1`, [hecho.pedido_id]);
    expect(despues.estado).toBe(antes.estado);
    expect(despues.estado).not.toBe("cancelado");
    const sesion = await uno<{ estado: string; acepta: boolean }>(
      `select estado, acepta_pedidos acepta from public.mesa_sesiones where id = $1`,
      [u.r.sesion_id],
    );
    expect(sesion).toMatchObject({ estado: "abierta", acepta: false });
    expect((await pedir(u)).reason).toBe("mesa-liberada");
  });

  it("18. liberar no cancela un pedido en preparación ni uno listo", async () => {
    const m = await mesa(ambos, 21);
    await sentar(ambos, 21);
    const u = await unirse(m.token);
    const hecho = await pedir(u);
    const segundo = await pedir(u);
    expect((await cobrar(String(hecho.pedido_id))).ok).toBe(true);
    expect((await cobrar(String(segundo.pedido_id))).ok).toBe(true);
    await base();
    await q(`update public.pedidos set estado = 'en_preparacion' where id = $1`, [hecho.pedido_id]);
    await q(`update public.pedidos set estado = 'listo' where id = $1`, [segundo.pedido_id]);
    const listo = { id: String(segundo.pedido_id) };
    await como("authenticated", admin);
    await rpc(`select public.liberar_mesas($1, 21, true) r`, [ambos]);
    const estados = await q(`select estado from public.pedidos where id = any($1::uuid[]) order by estado`, [
      [hecho.pedido_id, listo.id],
    ]);
    expect(estados.map((r) => r.estado).sort()).toEqual(["en_preparacion", "listo"]);
  });

  it("19. un consumo sin cobrar deja la sesión abierta y sin pedidos nuevos", async () => {
    const m = await mesa(ambos, 22);
    await sentar(ambos, 22);
    const u = await unirse(m.token);
    const pedido = await pedir(u);
    expect((await cobrar(String(pedido.pedido_id))).ok).toBe(true);
    await base();
    await q(`update public.pedidos set estado = 'listo' where id = $1`, [pedido.pedido_id]);
    await q(`update public.pedidos set estado = 'retirado' where id = $1`, [pedido.pedido_id]);
    await q(
      `insert into public.pedido_items (pedido_id, local_id, sesion_id, comensal_id, nombre, precio_unitario, cantidad)
       values ($1, $2, $3, $4, 'Extra', 500, 1)`,
      [pedido.pedido_id, ambos, u.r.sesion_id, u.r.comensal_id],
    );
    await como("authenticated", admin);
    await rpc(`select public.liberar_mesas($1, 22, true) r`, [ambos]);
    const sesion = await uno<{ estado: string; acepta: boolean }>(
      `select estado, acepta_pedidos acepta from public.mesa_sesiones where id = $1`,
      [u.r.sesion_id],
    );
    expect(sesion).toMatchObject({ estado: "abierta", acepta: false });
    expect((await uno<{ estado: string }>(`select estado from public.pedidos where id = $1`, [pedido.pedido_id])).estado).toBe("retirado");
    expect((await pedir(u)).reason).toBe("mesa-liberada");
  });

  it("20. pagar la cuenta no libera la mesa", async () => {
    const m = await mesa(ambos, 23);
    await sentar(ambos, 23);
    const occ = await estadoMesa(m.id);
    await base();
    const sesion = await uno<{ id: string }>(
      `insert into public.mesa_sesiones (
         local_id, mesa_id, mesa_numero, flujo, ocupacion_espera_id, ocupacion_reserva_id
       ) values ($1, $2, 23, 'cuenta', $3, $4) returning id`,
      [ambos, m.id, occ.espera_id, occ.reserva_id],
    );
    await q(`update public.mesa_sesiones set estado = 'pagada', pagada_en = now() where id = $1`, [sesion.id]);
    expect((await estadoMesa(m.id)).estado).toBe("ocupada");
    expect(
      (await uno<{ motivo: string }>(`select public._bloqueo_pedido_sesion($1) motivo`, [sesion.id])).motivo,
    ).toBe("mesa-cerrada");
  });

  it("21 y 22. la ocupación nueva no hereda la sesión anterior", async () => {
    const m = await mesa(ambos, 24);
    await sentar(ambos, 24, "Ana");
    const vieja = await unirse(m.token, "Ana");
    const viejoPedido = await pedir(vieja);
    await como("authenticated", admin);
    await rpc(`select public.liberar_mesas($1, 24, true) r`, [ambos]);
    expect((await pedir(vieja)).reason).toBe("mesa-liberada");
    expect((await sentar(ambos, 24, "Luis")).ok).toBe(true);
    const nueva = await unirse(m.token, "Luis");
    expect(nueva.r.ok).toBe(true);
    expect(nueva.r.sesion_id).not.toBe(vieja.r.sesion_id);
    expect((await pedir(nueva)).ok).toBe(true);
    expect((await uno<{ estado: string }>(`select estado from public.pedidos where id = $1`, [viejoPedido.pedido_id])).estado).not.toBe("cancelado");
    const cruce = await uno<{ n: number }>(
      `select count(*)::int n from public.pedidos where sesion_id = $1 and id = $2`,
      [nueva.r.sesion_id, viejoPedido.pedido_id],
    );
    expect(cruce.n).toBe(0);
  });

  it("23. no hay dos sesiones que acepten pedidos para la misma mesa", async () => {
    const m = await mesa(ambos, 25);
    await sentar(ambos, 25);
    const u = await unirse(m.token);
    await base();
    await client.query("savepoint dup");
    await expect(
      client.query(
        `insert into public.mesa_sesiones (local_id, mesa_id, mesa_numero, flujo, acepta_pedidos)
         values ($1, $2, 25, 'autoservicio', true)`,
        [ambos, m.id],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await client.query("rollback to savepoint dup");
    await q(`update public.mesa_sesiones set acepta_pedidos = false where id = $1`, [u.r.sesion_id]);
    const otra = await uno<{ id: string }>(
      `insert into public.mesa_sesiones (local_id, mesa_id, mesa_numero, flujo, acepta_pedidos)
       values ($1, $2, 25, 'autoservicio', true) returning id`,
      [ambos, m.id],
    );
    expect(otra.id).not.toBe(u.r.sesion_id);
  });

  it("24. el segundo ingreso de la misma ocupación no abre otra sesión", async () => {
    const m = await mesa(ambos, 26);
    await sentar(ambos, 26);
    const a = await unirse(m.token, "Ana");
    const b = await unirse(m.token, "Bea");
    const n = await uno<{ n: number }>(
      `select count(*)::int n from public.mesa_sesiones
        where mesa_id = $1 and estado in ('abierta', 'pagada') and acepta_pedidos`,
      [m.id],
    );
    expect(n.n).toBe(1);
    expect(a.r.sesion_id).toBe(b.r.sesion_id);
  });

  it("25. dos altas de la misma mesa: la segunda no la pisa", async () => {
    await mesa(ambos, 27);
    expect((await sentar(ambos, 27, "Ana")).ok).toBe(true);
    const segunda = await sentar(ambos, 27, "Luis");
    expect(segunda).toMatchObject({ ok: false, reason: "mesa-no-disponible" });
    const ocupantes = await uno<{ n: number }>(
      `select count(*)::int n from public.mesas where local_id = $1 and numero = 27 and estado = 'ocupada'`,
      [ambos],
    );
    expect(ocupantes.n).toBe(1);
  });

  it("26. la caja no usa la ocupación del QR y la etiqueta no es una mesa", async () => {
    /* crear_pedido rechaza la misma referencia dentro de la jornada
     * (referencia-duplicada). Eso es la regla del mostrador, no la ocupación.
     * El esquema sí deja repetir la etiqueta: el trigger de ocupación no mira
     * un pedido sin sesión. */
    const caja = await sucursal(org, "caja", { espera: true, pedidos: true, pagos: false, mesa: false });
    await base();
    await q(`update public.locales set pedidos_modalidad = 'mostrador' where id = $1`, [caja]);
    const m = await mesa(caja, 4);
    await como("authenticated", admin);
    const a = await rpc(
      `select public.crear_pedido($1, 'Mesa 4', null, now(), now() + interval '6 hours') r`,
      [caja],
    );
    expect(a.ok).toBe(true);
    const b = await rpc(
      `select public.crear_pedido($1, 'Mesa 4', null, now(), now() + interval '6 hours') r`,
      [caja],
    );
    expect(b).toMatchObject({ ok: false, reason: "referencia-duplicada" });
    expect((await estadoMesa(m.id)).estado).toBe("libre");
    await base();
    const ids = await q(
      `insert into public.pedidos (local_id, referencia, estado, qr_token, qr_expira_en)
       values ($1, 'Mesa 4', 'creado', gen_random_uuid()::text, now() + interval '2 hours'),
              ($1, 'Mesa 4', 'creado', gen_random_uuid()::text, now() + interval '2 hours')
       returning id, sesion_id`,
      [caja],
    );
    expect(ids).toHaveLength(2);
    expect(ids.every((r) => r.sesion_id == null)).toBe(true);
    expect((await estadoMesa(m.id)).estado).toBe("libre");
  });

  it("27. el QR de mostrador no depende de una mesa física", async () => {
    await base();
    const sesion = await uno<{ id: string }>(
      `insert into public.mesa_sesiones (local_id, mesa_id, flujo)
       values ($1, null, 'mostrador_qr') returning id`,
      [ambos],
    );
    const motivo = await uno<{ motivo: string | null }>(
      `select public._bloqueo_pedido_sesion($1) motivo`,
      [sesion.id],
    );
    expect(motivo.motivo).toBeNull();
    const comensal = await uno<{ id: string }>(
      `insert into public.comensales (sesion_id, local_id, nombre, token_hash)
       values ($1, $2, 'Ana', $3) returning id`,
      [sesion.id, ambos, sha(crypto.randomUUID())],
    );
    const pedido = await uno<{ id: string }>(
      `insert into public.pedidos (
         local_id, referencia, estado, qr_token, qr_expira_en, sesion_id, comensal_id, autoservicio
       ) values ($1, 'Mostrador', 'creado', gen_random_uuid()::text, now() + interval '2 hours', $2, $3, true)
       returning id`,
      [ambos, sesion.id, comensal.id],
    );
    expect(pedido.id).toBeTruthy();
  });

  it("28. qr_activo sigue siendo el sticker de Pagos, no la ocupación", async () => {
    const pagos = await sucursal(org, "pagos", { espera: true, pedidos: true, pagos: true, mesa: false });
    const m = await mesa(pagos, 3, false);
    await sentar(pagos, 3);
    await como("service_role", null);
    const apagado = await rpc(`select public.unirse_mesa($1, 'Ana', $2) r`, [m.token, sha(crypto.randomUUID())]);
    expect(apagado).toMatchObject({ ok: false, reason: "not-found" });
    expect((await estadoMesa(m.id)).estado).toBe("ocupada");
    await base();
    await q(`update public.mesas set qr_activo = true where id = $1`, [m.id]);
    await como("service_role", null);
    const prendido = await rpc(`select public.unirse_mesa($1, 'Ana', $2) r`, [m.token, sha(crypto.randomUUID())]);
    expect(prendido.ok).toBe(true);
    expect((await estadoMesa(m.id)).estado).toBe("ocupada");
  });

  it("anon no ejecuta las RPC de autoservicio ni de unión", async () => {
    const m = await mesa(ambos, 28);
    await como("anon", null);
    const rechaza = async (sql: string, params: unknown[]) => {
      await client.query("savepoint denegado");
      await expect(client.query(sql, params)).rejects.toMatchObject({ code: "42501" });
      await client.query("rollback to savepoint denegado");
    };
    await rechaza(`select public.unirse_mesa_autoservicio($1, 'Ana', $2)`, [m.token, sha("a")]);
    await rechaza(`select public.unirse_mesa($1, 'Ana', $2)`, [m.token, sha("b")]);
    await rechaza(
      `select public.sentar_walkin($1, array[28], 'Ana', 2, null, now() + interval '3 hours')`,
      [ambos],
    );
  });

  it("un pago pendiente también deja la sesión para resolver", async () => {
    const m = await mesa(ambos, 29);
    await sentar(ambos, 29);
    const u = await unirse(m.token);
    const pedido = await pedir(u);
    await base();
    await q(
      `insert into public.pagos_mesa (
         local_id, sesion_id, pedido_id, pagador_nombre, modo, monto_base, metodo, estado, creado_por
       ) values ($1, $2, $3, 'Ana', 'uno', 1500, 'efectivo', 'pendiente', 'comensal')`,
      [ambos, u.r.sesion_id, pedido.pedido_id],
    );
    await como("authenticated", admin);
    await rpc(`select public.liberar_mesas($1, 29, true) r`, [ambos]);
    const sesion = await uno<{ estado: string; acepta: boolean }>(
      `select estado, acepta_pedidos acepta from public.mesa_sesiones where id = $1`,
      [u.r.sesion_id],
    );
    expect(sesion).toMatchObject({ estado: "abierta", acepta: false });
    const pago = await uno<{ estado: string }>(
      `select estado from public.pagos_mesa where sesion_id = $1`,
      [u.r.sesion_id],
    );
    expect(pago.estado).toBe("pendiente");
  });

  it("p_forzar no sienta dentro de la ventana y sí sienta fuera", async () => {
    const tomada = await mesa(ambos, 30);
    const libre = await mesa(ambos, 31);
    await base();
    await reservar(ambos, 30, "now() + interval '10 minutes'");
    await reservar(ambos, 31, "now() + interval '3 hours'");
    const esperaTomada = (
      await uno<{ id: string }>(
        `insert into public.esperas (local_id, nombre, personas, qr_token, qr_expira_en)
         values ($1, 'Forzar', 2, gen_random_uuid()::text, now() + interval '2 hours') returning id`,
        [ambos],
      )
    ).id;
    const esperaLibre = (
      await uno<{ id: string }>(
        `insert into public.esperas (local_id, nombre, personas, qr_token, qr_expira_en)
         values ($1, 'Luego', 2, gen_random_uuid()::text, now() + interval '2 hours') returning id`,
        [ambos],
      )
    ).id;
    await como("authenticated", admin);
    const adentro = await rpc(`select public.sentar_espera($1, $2, $3, true) r`, [
      ambos,
      esperaTomada,
      [30],
    ]);
    expect(adentro).toMatchObject({ ok: false, reason: "mesa-reservada" });
    expect((await estadoMesa(tomada.id)).estado).toBe("libre");
    const afuera = await rpc(`select public.sentar_espera($1, $2, $3, true) r`, [
      ambos,
      esperaLibre,
      [31],
    ]);
    expect(afuera.ok).toBe(true);
    expect((await estadoMesa(libre.id)).espera_id).toBe(esperaLibre);
    await base();
    const sinForzar = (
      await uno<{ id: string }>(
        `insert into public.esperas (local_id, nombre, personas, qr_token, qr_expira_en)
         values ($1, 'Sin forzar', 2, gen_random_uuid()::text, now() + interval '2 hours') returning id`,
        [ambos],
      )
    ).id;
    await como("authenticated", admin);
    await rpc(`select public.liberar_mesas($1, 31, true) r`, [ambos]);
    const tambien = await rpc(`select public.sentar_espera($1, $2, $3, false) r`, [
      ambos,
      sinForzar,
      [31],
    ]);
    expect(tambien.ok).toBe(true);
  });

  it("p_forzar no ocupa una mesa que ya está sentada", async () => {
    const m = await mesa(ambos, 36);
    await sentar(ambos, 36);
    const dueno = (await estadoMesa(m.id)).espera_id;
    await base();
    const otra = (
      await uno<{ id: string }>(
        `insert into public.esperas (local_id, nombre, personas, qr_token, qr_expira_en)
         values ($1, 'Tarde', 2, gen_random_uuid()::text, now() + interval '2 hours') returning id`,
        [ambos],
      )
    ).id;
    await como("authenticated", admin);
    const r = await rpc(`select public.sentar_espera($1, $2, $3, true) r`, [ambos, otra, [36]]);
    expect(r).toMatchObject({ ok: false, reason: "mesa-no-disponible" });
    expect((await estadoMesa(m.id)).espera_id).toBe(dueno);
  });

  it("soltar por estado archiva la sesión y no cancela la cocina", async () => {
    const m = await mesa(ambos, 37);
    await sentar(ambos, 37);
    const u = await unirse(m.token);
    const hecho = await pedir(u);
    expect((await cobrar(String(hecho.pedido_id))).ok).toBe(true);
    await base();
    await q(`update public.pedidos set estado = 'en_preparacion' where id = $1`, [hecho.pedido_id]);
    await q(`update public.mesas set capacidad = 9 where id = $1`, [m.id]);
    const antes = await uno<{ estado: string; acepta: boolean }>(
      `select estado, acepta_pedidos acepta from public.mesa_sesiones where id = $1`,
      [u.r.sesion_id],
    );
    expect(antes).toMatchObject({ estado: "abierta", acepta: true });
    await q(
      `update public.mesas set estado = 'libre', espera_id = null, reserva_id = null where id = $1`,
      [m.id],
    );
    const sesion = await uno<{ estado: string; acepta: boolean }>(
      `select estado, acepta_pedidos acepta from public.mesa_sesiones where id = $1`,
      [u.r.sesion_id],
    );
    expect(sesion).toMatchObject({ estado: "abierta", acepta: false });
    expect((await uno<{ estado: string }>(`select estado from public.pedidos where id = $1`, [hecho.pedido_id])).estado).toBe(
      "en_preparacion",
    );
    const otra = await mesa(soloPedidos, 9);
    const up = await unirse(otra.token);
    const pedido = await pedir(up, productoPedidos);
    expect((await sentar(soloPedidos, 9)).ok).toBe(true);
    await base();
    await q(
      `update public.mesas set estado = 'libre', espera_id = null, reserva_id = null where id = $1`,
      [otra.id],
    );
    const sigue = await uno<{ estado: string; acepta: boolean }>(
      `select estado, acepta_pedidos acepta from public.mesa_sesiones where id = $1`,
      [up.r.sesion_id],
    );
    expect(sigue).toMatchObject({ estado: "abierta", acepta: true });
    expect((await uno<{ estado: string }>(`select estado from public.pedidos where id = $1`, [pedido.pedido_id])).estado).not.toBe(
      "cancelado",
    );
  });

  it("el cliente no ocupa la mesa por un update directo", async () => {
    const m = await mesa(ambos, 32);
    const otra = await mesa(ambos, 35);
    await sentar(ambos, 32);
    await como("authenticated", admin);
    const denegado = async (sql: string, params: unknown[]) => {
      await client.query("savepoint denegado");
      await expect(client.query(sql, params)).rejects.toMatchObject({ code: "42501" });
      await client.query("rollback to savepoint denegado");
    };
    await denegado(`update public.mesas set estado = 'ocupada' where id = $1`, [otra.id]);
    await denegado(
      `update public.mesas set estado = 'libre', espera_id = null, reserva_id = null where id = $1`,
      [m.id],
    );
    const cap = await client.query(
      `update public.mesas set capacidad = 6 where id = $1 returning capacidad`,
      [m.id],
    );
    expect(cap.rows[0].capacidad).toBe(6);
    expect((await estadoMesa(m.id)).estado).toBe("ocupada");
  });

  it("una fila histórica ocupada sin ids se puede editar y no se puede repetir", async () => {
    await base();
    await client.query(`alter table public.mesas disable trigger mesas_ocupacion_valida`);
    const vieja = await uno<{ id: string }>(
      `insert into public.mesas (local_id, numero, estado) values ($1, 33, 'ocupada') returning id`,
      [ambos],
    );
    await client.query(`alter table public.mesas enable trigger mesas_ocupacion_valida`);
    await q(`update public.mesas set capacidad = 8, qr_activo = true where id = $1`, [vieja.id]);
    const sigue = await estadoMesa(vieja.id);
    expect(sigue).toMatchObject({ estado: "ocupada", espera_id: null, reserva_id: null });
    await client.query("savepoint ambigua");
    await expect(
      client.query(
        `insert into public.mesas (local_id, numero, estado) values ($1, 34, 'ocupada')`,
        [ambos],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await client.query("rollback to savepoint ambigua");
  });
});

describe.skipIf(!lockEnabled)("Integración — dos operaciones no se pisan la mesa", () => {
  let a: pg.Client;
  let b: pg.Client;
  let org: string;
  let local: string;
  let admin: string;
  let mesaId: string;

  const conectar = async () => {
    const c = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false },
    });
    await c.connect();
    return c;
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("RUN_DB_CHECKS=1 requiere DATABASE_URL");
    a = await conectar();
    org = (
      await a.query(
        `insert into public.organizaciones (nombre, dueno_email, activo, estado_suscripcion, modulo_espera)
         values ($1, $2, true, 'active', true) returning id`,
        [`${MARCA} lock`, `${MARCA}-lock@test.invalid`],
      )
    ).rows[0].id as string;
    local = (
      await a.query(
        `insert into public.locales (organizacion_id, nombre, slug, modulo_espera, modulo_pedidos)
         values ($1, 'lock', $2, true, false) returning id`,
        [org, `${MARCA}-lock-${crypto.randomUUID().slice(0, 8)}`],
      )
    ).rows[0].id as string;
    admin = (
      await a.query(
        `insert into auth.users (id, email, invited_at, raw_user_meta_data)
         values (gen_random_uuid(), $1, now(), $2::jsonb) returning id`,
        [`${MARCA}-lock-${crypto.randomUUID()}@test.invalid`, JSON.stringify({ rol: "admin", organizacion_id: org })],
      )
    ).rows[0].id as string;
    mesaId = (
      await a.query(`insert into public.mesas (local_id, numero) values ($1, 1) returning id`, [local])
    ).rows[0].id as string;
  });

  afterAll(async () => {
    if (a) {
      await a.query("rollback").catch(() => undefined);
      await a.query(`delete from public.organizaciones where id = $1`, [org]).catch(() => undefined);
      await a.query(`delete from auth.users where id = $1`, [admin]).catch(() => undefined);
      await a.end();
    }
    await b?.end();
  });

  it("25. la segunda transacción espera el lock de la mesa", async () => {
    b = await conectar();
    await a.query("begin");
    await a.query(`select id from public.mesas where id = $1 for update`, [mesaId]);
    await b.query("begin");
    await b.query(`set local statement_timeout = '400ms'`);
    await expect(
      b.query(
        `select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: admin, role: "authenticated" })],
      ),
    ).resolves.toBeTruthy();
    await b.query(`set local role authenticated`);
    await expect(
      b.query(`select public.sentar_walkin($1, array[1], 'Ana', 2, null, now() + interval '2 hours')`, [local]),
    ).rejects.toMatchObject({ code: "57014" });
    await b.query("rollback");
    await a.query("rollback");
    const estado = await a.query(`select estado from public.mesas where id = $1`, [mesaId]);
    expect(estado.rows[0].estado).toBe("libre");
  });
});

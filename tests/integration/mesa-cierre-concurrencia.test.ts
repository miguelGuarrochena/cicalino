/**
 * Cierre de la mesa pagada con dos conexiones de verdad.
 *
 *   RUN_DB_CHECKS=1 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55422/postgres \
 *     pnpm test:db tests/integration/mesa-cierre-concurrencia.test.ts
 *
 * A diferencia del resto de test:db, acá no alcanza con una transacción que
 * termina en rollback: para que una conexión espere a la otra, los datos de
 * partida tienen que estar confirmados. Por eso este archivo ESCRIBE y solo
 * corre contra una base en loopback (Supabase local); con cualquier otro host
 * se saltea entero. Al final borra lo que creó.
 *
 * Lo que fija (table-close-waits-for-kitchen.sql): que dos cosas al mismo
 * tiempo no dejen la mesa pagada sin cerrar, que nada se pierda en silencio y
 * que un deadlock, si aparece, sea un error explícito que se puede reintentar.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const hostDe = (url: string | undefined): string => {
  try {
    return url ? new URL(url).hostname : "";
  } catch {
    return "";
  }
};
const local = LOOPBACK.has(hostDe(process.env.DATABASE_URL));
const enabled = process.env.RUN_DB_CHECKS === "1" && local;

const MARCA = "zz-concurrencia-test";
const CORRIDA = crypto.randomUUID().slice(0, 8);
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
type Json = Record<string, unknown> & { ok?: boolean; reason?: string };

describe.skipIf(!enabled)("Integration — cierre de mesa con dos conexiones (solo loopback)", () => {
  let a: pg.Client;
  let b: pg.Client;
  /* Solo mira pg_stat_activity: dentro de una transacción abierta esa vista
   * queda congelada, así que no puede ser a ni b. */
  let mon: pg.Client;
  let org: string;
  let localId: string;
  let admin: string;
  let mesaToken: string;
  let productos: Record<string, string>;

  const conectar = async () => {
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: false });
    await c.connect();
    /* Un cuelgue de verdad tiene que fallar a la vista, no colgar la suite. */
    await c.query("set statement_timeout = '15s'");
    return c;
  };

  /* Una operación como la hace PostgREST: claims + rol, en su transacción. */
  const como = async (c: pg.Client, role: "authenticated" | "service_role", sub: string | null) => {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role })]);
    await c.query(`set local role ${role}`);
  };
  const r1 = async <T = Json>(c: pg.Client, q: string, p: unknown[] = []) =>
    ((await c.query(q, p)).rows[0] ?? {}) as T;
  const tx = async <T>(c: pg.Client, fn: () => Promise<T>): Promise<T> => {
    await c.query("begin");
    try {
      const out = await fn();
      await c.query("commit");
      return out;
    } catch (err) {
      await c.query("rollback");
      throw err;
    }
  };
  const rpcSR = (q: string, p: unknown[]) =>
    tx(a, async () => {
      await como(a, "service_role", null);
      return (await r1<{ r: Json }>(a, q, p)).r;
    });

  const sesion = async (id: string) =>
    r1<{ estado: string; cerrada_motivo: string | null }>(
      a,
      `select estado, cerrada_motivo from public.mesa_sesiones where id = $1`,
      [id],
    );
  const estadoPedido = async (id: unknown) =>
    (await r1<{ estado: string }>(a, `select estado from public.pedidos where id = $1`, [id])).estado;

  /* Un comensal en la mesa (cada caso usa su propia mesa) con pedidos. */
  const mesaNueva = async (numero: number) => {
    await a.query(`insert into public.mesas (local_id, numero, qr_activo) values ($1, $2, true)`, [localId, numero]);
    mesaToken = (await r1<{ t: string }>(a, `select qr_token t from public.mesas where local_id = $1 and numero = $2`, [localId, numero])).t;
    const secreto = crypto.randomUUID();
    const g = await rpcSR(`select public.unirse_mesa($1, 'Ana', $2) r`, [mesaToken, sha(secreto)]);
    expect(g.ok).toBe(true);
    return { id: String(g.comensal_id), sesion: String(g.sesion_id), hash: sha(secreto) };
  };
  const pedir = async (g: { id: string; hash: string }, producto: string) => {
    const r = await rpcSR(`select public.pedir_como_comensal($1, $2, $3, $4) r`, [
      g.id,
      g.hash,
      JSON.stringify([{ producto_id: productos[producto], cantidad: 1 }]),
      crypto.randomUUID(),
    ]);
    expect(r.ok).toBe(true);
    return String(r.pedido_id);
  };
  const cobrarTodo = (sesionId: string) =>
    tx(a, async () => {
      await como(a, "authenticated", admin);
      return (
        await r1<{ r: Json }>(a, `select public.registrar_pago_personal($1, $2) r`, [
          sesionId,
          JSON.stringify({ clave: crypto.randomUUID(), modo: "uno", metodo: "efectivo", pagador_nombre: "Mesa", confirmado: true }),
        ])
      ).r;
    });

  /* La segunda conexión queda esperando el lock: la promesa no resuelve
   * hasta que la primera confirma. Lo comprobamos mirando pg_stat_activity. */
  const esperandoLock = async (c: pg.Client) => {
    const pid = (await c.query("select pg_backend_pid() pid")).rows[0].pid as number;
    return async () => {
      for (let i = 0; i < 50; i++) {
        const w = await r1<{ w: string | null }>(mon, `select wait_event_type w from pg_stat_activity where pid = $1`, [pid]);
        if (w.w === "Lock") return true;
        await new Promise((r) => setTimeout(r, 50));
      }
      return false;
    };
  };

  beforeAll(async () => {
    a = await conectar();
    b = await conectar();
    mon = await conectar();
    const yaEsta = await r1<{ ok: boolean }>(a, `select to_regprocedure('public._sesion_cocina_pendiente(uuid)') is not null ok`);
    if (!yaEsta.ok) throw new Error("Falta aplicar table-close-waits-for-kitchen.sql en la base local");

    org = (await r1<{ id: string }>(a,
      `insert into public.organizaciones (nombre, dueno_email, activo, estado_suscripcion)
       values ($1, $2, true, 'active') returning id`,
      [`${MARCA} org`, `${MARCA}-${CORRIDA}-org@test.invalid`])).id;
    localId = (await r1<{ id: string }>(a,
      `insert into public.locales (organizacion_id, nombre, slug, modulo_pagos)
       values ($1, 'centro', $2, true) returning id`,
      [org, `${MARCA}-${crypto.randomUUID().slice(0, 8)}`])).id;
    admin = (await r1<{ id: string }>(a,
      `insert into auth.users (id, email, invited_at, raw_user_meta_data)
       values (gen_random_uuid(), $1, now(), $2::jsonb) returning id`,
      [`${MARCA}-${CORRIDA}-admin@test.invalid`, JSON.stringify({ rol: "admin", organizacion_id: org })])).id;
    const rows = (await a.query(
      `insert into public.productos (local_id, nombre, precio) values
         ($1, 'Hamburguesa', 10000), ($1, 'Agua', 2000) returning id, nombre`,
      [localId],
    )).rows;
    productos = Object.fromEntries(rows.map((r) => [r.nombre, r.id]));
    await a.query(`insert into public.local_cobros (local_id) values ($1) on conflict do nothing`, [localId]);
  });

  /* Cada borrado por su lado: si uno falla, los otros igual corren y el
   * error queda a la vista en vez de dejar basura para la próxima corrida. */
  afterAll(async () => {
    const borrar = async (q: string, id: string | undefined) => {
      if (!id) return;
      try {
        await a.query(q, [id]);
      } catch (err) {
        console.error("limpieza", q, err instanceof Error ? err.message : err);
      }
    };
    if (a) {
      await a.query("rollback").catch(() => undefined);
      await borrar(`delete from public.locales where id = $1`, localId);
      await borrar(`delete from public.organizaciones where id = $1`, org);
      await borrar(`delete from auth.users where id = $1`, admin);
    }
    await a?.end();
    await b?.end();
    await mon?.end();
  });

  /* Un caso que falla a mitad deja una transacción abierta y el rol
   * cambiado: el siguiente arranca de cero. */
  let numero = 0;
  beforeEach(async () => {
    numero += 1;
    for (const c of [a, b]) {
      await c.query("rollback").catch(() => undefined);
      await c.query("reset role");
    }
  });

  it("dos pedidos anotados a la vez: la segunda espera y la mesa se cierra", async () => {
    const g = await mesaNueva(numero);
    const p1 = await pedir(g, "Hamburguesa");
    const p2 = await pedir(g, "Agua");
    expect((await cobrarTodo(g.sesion)).ok).toBe(true);
    expect((await sesion(g.sesion)).estado).toBe("pagada");

    await b.query("begin");
    await como(b, "authenticated", admin);
    await a.query("begin");
    await como(a, "authenticated", admin);
    await a.query(`update public.pedidos set estado = 'en_preparacion' where id = $1`, [p1]);
    const espera = await esperandoLock(b);
    const segunda = b.query(`update public.pedidos set estado = 'en_preparacion' where id = $1`, [p2]);
    expect(await espera()).toBe(true);
    await a.query("commit");
    await segunda;
    await b.query("commit");

    expect(await estadoPedido(p1)).toBe("en_preparacion");
    expect(await estadoPedido(p2)).toBe("en_preparacion");
    expect(await sesion(g.sesion)).toMatchObject({ estado: "cerrada", cerrada_motivo: "pagada" });
  });

  it.each(["anotar primero", "cobrar primero"])(
    "el último pedido anotado mientras la caja confirma el cobro (%s): se cierra",
    async (orden) => {
      const g = await mesaNueva(numero);
      const p1 = await pedir(g, "Hamburguesa");
      const pago = await rpcSR(`select public.pagar_como_comensal($1, $2, $3) r`, [
        g.id,
        g.hash,
        JSON.stringify({ clave: crypto.randomUUID(), modo: "uno", metodo: "efectivo" }),
      ]);
      expect(pago.ok).toBe(true);

      const anotar = { c: orden === "anotar primero" ? a : b };
      const cobrar = { c: anotar.c === a ? b : a };
      await anotar.c.query("begin");
      await como(anotar.c, "authenticated", admin);
      await cobrar.c.query("begin");
      await como(cobrar.c, "authenticated", admin);

      const primero = orden === "anotar primero" ? anotar.c : cobrar.c;
      const segundoC = primero === anotar.c ? cobrar.c : anotar.c;
      const opAnotar = () => anotar.c.query(`update public.pedidos set estado = 'en_preparacion' where id = $1`, [p1]);
      const opCobrar = () => cobrar.c.query(`select public.confirmar_pago_mesa($1) r`, [pago.pago_id]);

      await (primero === anotar.c ? opAnotar() : opCobrar());
      const espera = await esperandoLock(segundoC);
      const segunda = segundoC === anotar.c ? opAnotar() : opCobrar();
      expect(await espera()).toBe(true);
      await primero.query("commit");
      const res = await segunda;
      await segundoC.query("commit");
      if (segundoC === cobrar.c) expect((res.rows[0].r as Json).ok).toBe(true);

      expect(await estadoPedido(p1)).toBe("en_preparacion");
      expect(
        (await r1<{ estado: string }>(a, `select estado from public.pagos_mesa where id = $1`, [pago.pago_id])).estado,
      ).toBe("pagado");
      expect(await sesion(g.sesion)).toMatchObject({ estado: "cerrada", cerrada_motivo: "pagada" });
    },
  );

  it("cancelar (comensal) y anotar (mozo) el mismo pedido a la vez: uno gana, el otro falla a la vista y reintentar es seguro", async () => {
    const g = await mesaNueva(numero);
    const p1 = await pedir(g, "Hamburguesa");
    await pedir(g, "Agua");

    /* El comensal toma la sesión (primer paso de cancelar_pedido_comensal),
     * el mozo toma la fila del pedido y su trigger espera la sesión, y el
     * comensal va por la fila: el cruce que puede terminar en deadlock. */
    await b.query("begin");
    await como(b, "service_role", null);
    await b.query(`select 1 from public.mesa_sesiones where id = $1 for update`, [g.sesion]);
    await a.query("begin");
    await como(a, "authenticated", admin);
    /* El pid se pide antes: con la consulta colgada, la conexión no atiende otra. */
    const espera = await esperandoLock(a);
    const anotar = a.query(`update public.pedidos set estado = 'en_preparacion' where id = $1`, [p1]).then(
      () => ({ ok: true as const }),
      (err: { code?: string }) => ({ ok: false as const, code: err.code }),
    );
    expect(await espera()).toBe(true);
    const cancelar = b.query(`select public.cancelar_pedido_comensal($1, $2, $3) r`, [g.id, g.hash, p1]).then(
      (r) => ({ ok: true as const, r: r.rows[0].r as Json }),
      (err: { code?: string }) => ({ ok: false as const, code: err.code }),
    );
    const [ra, rb] = await Promise.all([anotar, cancelar]);
    await a.query(ra.ok ? "commit" : "rollback");
    await b.query(rb.ok ? "commit" : "rollback");

    /* Ninguna operación se pierde en silencio: o terminó, o dio un error. */
    const fallas = [ra, rb].filter((x) => !x.ok) as { code?: string }[];
    expect(fallas.length).toBeLessThanOrEqual(1);
    for (const f of fallas) expect(f.code).toBe("40P01");
    const final = await estadoPedido(p1);
    expect(["cancelado", "en_preparacion"]).toContain(final);
    if (rb.ok && rb.r.ok) expect(final).toBe("cancelado");
    if (ra.ok && !(rb.ok && rb.r.ok)) expect(final).toBe("en_preparacion");

    /* Reintentar lo que falló no rompe nada: responde con el estado real. */
    if (!rb.ok) {
      const otra = await rpcSR(`select public.cancelar_pedido_comensal($1, $2, $3) r`, [g.id, g.hash, p1]);
      expect(otra).toMatchObject({ ok: false, reason: "ya-anotado" });
    }
    if (!ra.ok) {
      const filas = await tx(a, async () => {
        await como(a, "authenticated", admin);
        return (await a.query(
          `update public.pedidos set estado = 'en_preparacion' where id = $1 and estado = 'creado'`,
          [p1],
        )).rowCount;
      });
      expect(filas).toBe(0);
    }
    expect((await sesion(g.sesion)).estado).toBe("abierta");
  });

  it("dos avisos aprobados de Mercado Pago a la vez y uno tardío: un solo cobro y la mesa no se reabre", async () => {
    await a.query(
      `insert into public.mp_cuentas (local_id, mp_user_id, access_token_cifrado, refresh_token_cifrado, expira_en)
       values ($1, '1', 'x', 'y', now() + interval '90 days') on conflict do nothing`,
      [localId],
    );
    await a.query(`update public.local_cobros set acepta_mercado_pago = true where local_id = $1`, [localId]);
    const g = await mesaNueva(numero);
    const p1 = await pedir(g, "Hamburguesa");
    await tx(a, async () => {
      await como(a, "authenticated", admin);
      await a.query(`update public.pedidos set estado = 'en_preparacion' where id = $1`, [p1]);
    });
    const mp = await rpcSR(`select public.pagar_como_comensal($1, $2, $3) r`, [
      g.id,
      g.hash,
      JSON.stringify({ clave: crypto.randomUUID(), modo: "uno", metodo: "mercado_pago" }),
    ]);
    expect(mp.ok).toBe(true);
    const aviso = (c: pg.Client) =>
      c.query(`select public.mp_confirmar_pago($1, $2, 'mp-77', 'approved', $3, 'ARS') r`, [
        localId,
        mp.pago_id,
        mp.monto_total,
      ]);

    await a.query("begin");
    await como(a, "service_role", null);
    await b.query("begin");
    await como(b, "service_role", null);
    const primero = (await aviso(a)).rows[0].r as Json;
    const espera = await esperandoLock(b);
    const segundo = aviso(b);
    expect(await espera()).toBe(true);
    await a.query("commit");
    const repetido = (await segundo).rows[0].r as Json;
    await b.query("commit");

    expect(primero.ok).toBe(true);
    expect(repetido).toMatchObject({ ok: true, repetido: true });
    expect(await sesion(g.sesion)).toMatchObject({ estado: "cerrada", cerrada_motivo: "pagada" });

    const tarde = await rpcSR(`select public.mp_confirmar_pago($1, $2, 'mp-77', 'approved', $3, 'ARS') r`, [
      localId,
      mp.pago_id,
      mp.monto_total,
    ]);
    expect(tarde).toMatchObject({ ok: true, repetido: true });
    expect((await sesion(g.sesion)).estado).toBe("cerrada");
    const n = await r1<{ n: number }>(a,
      `select count(*)::int n from public.pagos_mesa where sesion_id = $1 and estado = 'pagado'`, [g.sesion]);
    expect(n.n).toBe(1);
    const confirmados = await r1<{ n: number }>(a,
      `select count(*)::int n from public.mesa_eventos where sesion_id = $1 and tipo = 'pago_confirmado'`, [g.sesion]);
    expect(confirmados.n).toBe(1);
  });
});

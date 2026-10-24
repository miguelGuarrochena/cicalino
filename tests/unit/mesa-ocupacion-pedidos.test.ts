import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapBill } from "../../src/lib/tableBill";
import { mapPickupState } from "../../src/lib/tablePickup";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const sql = read("supabase/mesa-ocupacion-pedidos.sql");
const orden: string[] = JSON.parse(read("supabase/orden.json"));
const chequeo = read("supabase/chequeo-migraciones.sql");
const i18n = read("src/lib/i18n.ts");

const funcion = (nombre: string): string => {
  const i = sql.indexOf(`create or replace function public.${nombre}(`);
  expect(i, nombre).toBeGreaterThan(-1);
  const j = sql.indexOf("\n$$;", i);
  return sql.slice(i, j);
};

describe("mesa-ocupacion-pedidos — migración", () => {
  it("va después de las funciones que reemplaza y está registrada", () => {
    const pos = orden.indexOf("mesa-ocupacion-pedidos.sql");
    expect(orden.at(-1)).toBe("data-api-grants.sql");
    /* Lo que corre después no pisa ninguna de sus funciones. */
    const propias = [...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
    for (const despues of orden.slice(pos + 1)) {
      const texto = readFileSync(join(process.cwd(), "supabase", despues), "utf8");
      for (const f of propias) {
        expect(texto, `${despues} redefine ${f}`).not.toContain(`create or replace function public.${f}(`);
      }
    }
    for (const previa of [
      "pedidos-mesa.sql",
      "plato-aclaracion.sql",
      "cocina-pase.sql",
      "sentar-espera-reserva.sql",
      "mesa-launch-blockers.sql",
      "split-payments-module.sql",
    ]) {
      expect(orden.indexOf(previa)).toBeGreaterThan(-1);
      expect(orden.indexOf(previa)).toBeLessThan(pos);
    }
    expect(chequeo).toContain("mesa_sync_recepcion_pedidos");
    expect(chequeo).toContain("pedidos_ocupacion_guard");
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true);
    expect(sql).toContain(
      "revoke all on function public.sentar_walkin(uuid, integer[], text, integer, uuid, timestamptz) from public, anon",
    );
    expect(read("supabase/security-fixes-02.sql")).toContain("column_name = 'pin'");
  });

  it("la sincronización exige los dos módulos y no se infiere de los datos", () => {
    const sync = funcion("mesa_sync_recepcion_pedidos");
    expect(sync).toContain("local_tiene_modulo(p_local, 'espera')");
    expect(sync).toContain("local_tiene_modulo(p_local, 'pedidos')");
    expect(sync).not.toMatch(/from public\.mesas/);
    expect(sync).not.toMatch(/from public\.reservas/);
  });

  it("la ventana de reserva es la del mapa: 30 minutos antes hasta la gracia", () => {
    const ventana = funcion("mesa_en_ventana_de_reserva");
    expect(ventana).toContain("interval '30 minutes'");
    expect(ventana).toContain("r.estado = 'activa'");
    expect(ventana).toContain("gracia_minutos");
    expect(ventana).not.toContain("'reservada'");
  });

  it("abrir sesión y pedir pasan por el mismo bloqueo", () => {
    expect(funcion("unirse_mesa")).toContain("_bloqueo_abrir_sesion");
    expect(funcion("unirse_mesa_autoservicio")).toContain("_bloqueo_abrir_sesion");
    expect(funcion("pedir_como_comensal")).toContain("_bloqueo_pedido_sesion");
    expect(funcion("pedir_autoservicio")).toContain("_bloqueo_pedido_sesion");
    expect(funcion("liberar_mesas")).toContain("_soltar_sesiones_mesa");
    expect(sql).toContain("for each row execute function public.pedidos_ocupacion_guard()");
    expect(sql).toContain("after update of estado on public.mesas");
    expect(sql).toContain("execute function public.mesas_soltar_pedidos()");
  });

  it("caja y mostrador no heredan la ocupación de la mesa", () => {
    const bloqueo = funcion("_bloqueo_pedido_sesion");
    expect(bloqueo).toContain("mostrador_qr");
    expect(bloqueo).toContain("v_s.mesa_id is null");
    const guard = funcion("pedidos_ocupacion_guard");
    expect(guard).toContain("if new.sesion_id is null then");
  });

  it("el QR de Pagos sigue exigiendo el sticker y libera no cierra la cocina", () => {
    expect(funcion("unirse_mesa")).toContain("not v_m.qr_activo");
    expect(funcion("unirse_mesa_autoservicio")).not.toContain("qr_activo");
    const archivar = funcion("_archivar_sesion_anterior");
    expect(archivar).toContain("acepta_pedidos = false");
    expect(archivar).toContain("_cerrar_sesion(p_sesion, 'mesa-liberada')");
    expect(archivar).not.toContain("estado = 'cancelado'");
  });

  it("una ocupación nueva exige una referencia y el cliente no la escribe", () => {
    const guarda = funcion("mesas_ocupacion_valida");
    expect(guarda).toContain("new.estado is not distinct from old.estado");
    expect(guarda).toContain("current_user in ('anon', 'authenticated', 'service_role')");
    expect(guarda).toContain("e.estado = 'sentado'");
    expect(guarda).toContain("r.estado = 'sentada'");
    expect(sql).toContain("before insert or update on public.mesas");
    expect(sql).not.toMatch(/check \(estado <> 'ocupada'/);
  });

  it("sentar igual no saltea la mesa ocupada ni la ventana que el mapa ya bloquea", () => {
    const sentar = funcion("sentar_espera");
    const lock = sentar.indexOf("for update");
    const libres = sentar.indexOf("mesa-no-disponible");
    const ventana = sentar.lastIndexOf("mesa_en_ventana_de_reserva");
    expect(lock).toBeGreaterThan(-1);
    expect(libres).toBeGreaterThan(lock);
    expect(ventana).toBeGreaterThan(libres);
    expect(sentar).not.toContain("if not coalesce(p_forzar, false)");
    expect(sentar).toContain("espera_id = v_espera.id");
    expect(funcion("mesa_en_ventana_de_reserva")).toContain("interval '30 minutes'");
  });

  it("soltar pedidos solo mira el estado y no cancela la cocina", () => {
    const soltar = funcion("mesas_soltar_pedidos");
    expect(soltar).toContain("old.estado = 'ocupada'");
    expect(soltar).toContain("_soltar_sesiones_mesa");
    expect(soltar).not.toContain("update public.pedidos");
    expect(soltar).not.toContain("update public.mesas");
    expect(soltar).not.toMatch(/exception when others/i);
    expect(funcion("_soltar_sesiones_mesa")).toContain("mesa_sync_recepcion_pedidos");
    expect(sql).toContain("after update of estado on public.mesas");
    const archivar = funcion("_archivar_sesion_anterior");
    expect(archivar).toContain("acepta_pedidos = false");
    expect(archivar).not.toContain("en_preparacion");
  });

  it("la sesión guarda la ocupación y el índice único solo cubre la que acepta pedidos", () => {
    expect(sql).toContain("add column if not exists ocupacion_espera_id");
    expect(sql).toContain("add column if not exists ocupacion_reserva_id");
    expect(sql).toContain("add column if not exists acepta_pedidos");
    expect(sql).toContain(
      "where estado in ('abierta', 'pagada') and acepta_pedidos",
    );
    expect(funcion("_reutilizar_sesion_ocupacion")).toContain("is not distinct from");
  });

  it("pedir toma la mesa antes que la sesión", () => {
    for (const nombre of ["pedir_como_comensal", "pedir_autoservicio"]) {
      const cuerpo = funcion(nombre);
      const mesa = cuerpo.indexOf("from public.mesas");
      const sesion = cuerpo.indexOf("from public.mesa_sesiones where id = v_c.sesion_id for update");
      expect(mesa).toBeGreaterThan(-1);
      expect(sesion).toBeGreaterThan(mesa);
    }
  });
});

describe("mesa-ocupacion-pedidos — lo que ve el cliente", () => {
  it("puede_pedir manda sobre sesion_abierta y el motivo es el de la sesión", () => {
    const s = mapPickupState({
      ok: true,
      mesa: { id: "m1", numero: 4 },
      operativo: true,
      comensal: { id: "c1", nombre: "Ana", sesion_id: "s1" },
      sesion_abierta: true,
      puede_pedir: false,
      bloqueo: "mesa-no-habilitada",
      sesion_motivo: "mesa-liberada",
      pedidos: [],
      mesa_pedidos: [],
    })!;
    expect(s.canOrder).toBe(false);
    expect(s.blockReason).toBe("mesa-liberada");
  });

  it("sin los campos nuevos, el QR de un local viejo sigue pudiendo pedir", () => {
    const s = mapPickupState({
      ok: true,
      mesa: { id: "m1", numero: 4 },
      operativo: true,
      comensal: { id: "c1", nombre: "Ana", sesion_id: "s1" },
      sesion_abierta: true,
      pedidos: [],
      mesa_pedidos: [],
    })!;
    expect(s.canOrder).toBe(true);
    expect(s.blockReason).toBeNull();
  });

  it("la cuenta marca pedidos cerrados sin exigir el campo en fixtures viejos", () => {
    const abierta = mapBill({
      sesion: { id: "s", estado: "abierta", acepta_pedidos: false, bloqueo: "mesa-liberada" },
      totales: {},
    })!;
    expect(abierta.session.ordersOpen).toBe(false);
    expect(abierta.session.orderBlockReason).toBe("mesa-liberada");

    const vieja = mapBill({ sesion: { id: "s", estado: "abierta" }, totales: {} })!;
    expect(vieja.session.ordersOpen).toBe(true);
    expect(vieja.session.orderBlockReason).toBeNull();
  });

  it("los cuatro mensajes están en español y en inglés", () => {
    for (const frase of [
      "La mesa todavía no está habilitada para pedidos.",
      "Esta mesa tiene una reserva próxima.",
      "La sesión de esta mesa ya no está activa.",
      "La mesa fue liberada y necesitás validar nuevamente tu acceso.",
    ]) {
      expect(i18n).toContain(frase);
    }
    expect(i18n).toContain("This table isn't open for orders yet.");
    expect(i18n).toContain("This table has an upcoming reservation.");
  });
});

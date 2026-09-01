import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(
  join(root, "supabase/pedidos-en-preparacion.sql"),
  "utf8",
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);
const orden = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
) as string[];

describe("Paso automático a en_preparacion", () => {
  it("la regla es el minuto, y solo sobre pedidos que siguen en creado", () => {
    /* El `estado = 'creado'` no es un filtro cualquiera: es el
     * compare-and-swap que hace que dos cajas corriéndolo a la vez no se
     * pisen, y lo que garantiza que un pedido que salió listo antes del
     * minuto nunca pase por en_preparacion. */
    const local = sql.slice(sql.indexOf("marcar_en_preparacion_local"));
    expect(local).toMatch(/estado\s*=\s*'creado'/);
    expect(local).toMatch(/creado_en\s*<=\s*now\(\)\s*-\s*interval '1 minute'/);
    expect(local).toMatch(/set estado = 'en_preparacion'/);
    expect(local).toMatch(/en_preparacion_en = now\(\)/);
  });

  it("van las dos funciones: la del panel y la del cron", () => {
    expect(sql).toMatch(
      /create or replace function public\.marcar_en_preparacion_local\(p_local uuid\)/,
    );
    expect(sql).toMatch(
      /create or replace function public\.marcar_en_preparacion_pendientes\(\)/,
    );
  });

  it("la del panel chequea acceso; la del cron no la puede llamar un cliente", () => {
    const local = sql.slice(
      sql.indexOf("marcar_en_preparacion_local"),
      sql.indexOf("marcar_en_preparacion_pendientes"),
    );
    expect(local).toContain("puede_ver_local(p_local)");

    expect(sql).toMatch(
      /grant execute on function public\.marcar_en_preparacion_local\(uuid\) to authenticated/i,
    );
    expect(sql).toMatch(
      /revoke execute on function public\.marcar_en_preparacion_pendientes\(\)\s*\n?\s*from public, anon, authenticated/i,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.marcar_en_preparacion_pendientes/i,
    );
  });

  it("el barrido global tiene su índice", () => {
    expect(sql).toMatch(
      /create index if not exists idx_pedidos_creado_pendientes[\s\S]*where estado = 'creado'/,
    );
  });

  it("enCurso pasa a contar creado + en_preparacion", () => {
    /* Esta es la regresión que introduce el cambio: si `enCurso` siguiera
     * contando solo 'creado', "En cola ahora" empezaría a descontar los
     * pedidos apenas pasen de estado. */
    expect(sql).toMatch(
      /'enCurso',\s*count\(\*\) filter \(where estado in \('creado', 'en_preparacion'\)\)/,
    );
    expect(sql).not.toMatch(/'enCurso',\s*count\(\*\) filter \(where estado = 'creado'\)/);
  });

  it("quedan registrados los tramos que antes no se podían separar", () => {
    expect(sql).toContain("'colaMin'");
    expect(sql).toContain("'cocinaMin'");
    expect(sql).toContain("'sinPreparacion'");
    // El total sigue siendo el de siempre, para no romper la pantalla.
    expect(sql).toMatch(/'prepMin',\s*avg\(espera_min\)/);
  });

  it("colaMin ignora los pedidos que nunca llegaron a listo", () => {
    /* `en_preparacion_en` dice cuándo lo notó el barrido, no cuándo arrancó
     * la cocina. Un pedido abandonado en `creado` toda la noche lo marca el
     * cron a la mañana siguiente: sin este filtro esas horas entrarían al
     * promedio y lo dejarían sin sentido. */
    const cola = sql.slice(sql.indexOf("as cola_min") - 400, sql.indexOf("as cola_min"));
    expect(cola).toContain("listo_en is not null");
  });

  it("la función interna sigue sin ser llamable desde PostgREST", () => {
    expect(sql).toMatch(
      /revoke all on function public\.metricas_pedidos_datos\(uuid\[\], timestamptz, text, text\) from authenticated/i,
    );
  });

  it("está registrado y después de lo que necesita", () => {
    expect(chequeo).toContain(
      "('pedidos-en-preparacion.sql', 'security-fixes-02.sql, security-fixes-04.sql, metricas-tramos-global.sql')",
    );
    expect(orden).toContain("pedidos-en-preparacion.sql");
    for (const dep of [
      "security-fixes-02.sql",
      "security-fixes-04.sql",
      "metricas-tramos-global.sql",
    ]) {
      expect(
        orden.indexOf("pedidos-en-preparacion.sql"),
        `debe ir después de ${dep}`,
      ).toBeGreaterThan(orden.indexOf(dep));
    }
  });
});

describe("marcar_en_preparacion_local cerrada a public/anon", () => {
  const revoke = readFileSync(
    join(root, "supabase/en-preparacion-revoke.sql"),
    "utf8",
  );

  it("revoca lo heredado de PUBLIC y vuelve a otorgar a authenticated", () => {
    /* Postgres le da EXECUTE a PUBLIC en cada función nueva y anon hereda de
     * ahí; el grant original no alcanzaba para cerrarla. */
    expect(revoke).toMatch(
      /revoke all on function public\.marcar_en_preparacion_local\(uuid\)\s*\n?\s*from public, anon/i,
    );
    expect(revoke).toMatch(
      /grant execute on function public\.marcar_en_preparacion_local\(uuid\)\s*\n?\s*to authenticated/i,
    );
  });

  it("no reescribe el script histórico: el fix es aditivo", () => {
    /* pedidos-en-preparacion.sql ya está aplicado y el tracker indexa por
     * nombre de archivo: editarlo no volvería a correr nunca. Mismo criterio
     * que security-fixes-14 con expirar_reservas_vencidas. */
    expect(sql).not.toMatch(
      /revoke all on function public\.marcar_en_preparacion_local/i,
    );
  });

  it("no toca el chequeo de autorización", () => {
    expect(revoke).not.toContain("create or replace function");
    expect(sql).toContain("puede_ver_local(p_local)");
  });

  it("está registrado después del script que crea la función", () => {
    expect(chequeo).toContain(
      "('en-preparacion-revoke.sql', 'pedidos-en-preparacion.sql')",
    );
    expect(orden.indexOf("en-preparacion-revoke.sql")).toBeGreaterThan(
      orden.indexOf("pedidos-en-preparacion.sql"),
    );
  });
});

describe("El cron también lo barre", () => {
  const route = readFileSync(
    join(root, "src/app/api/cron/cobros/route.ts"),
    "utf8",
  );

  it("llama a la versión global, no a la del panel", () => {
    expect(route).toContain('"marcar_en_preparacion_pendientes"');
    expect(route).not.toContain("marcar_en_preparacion_local");
  });

  it("no rompe el job si falla: loguea y sigue", () => {
    const bloque = route.slice(route.indexOf("marcar_en_preparacion_pendientes"));
    expect(bloque).toMatch(/if \(errPrep\)/);
    expect(bloque).toContain("console.error");
  });
});

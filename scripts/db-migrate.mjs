/**
 * Aplica scripts pendientes de supabase/orden.json en orden.
 *
 * Uso:
 *   pnpm db:sql              # aplica lo que falte
 *   pnpm db:sql -- --dry-run # solo lista pendientes
 *   pnpm db:sql:baseline     # marca TODOS como aplicados sin correrlos
 *                            # (DB ya alineada a mano)
 *
 * Requiere DATABASE_URL (.env.local o entorno) y security-fixes-13
 * (tabla cicalino_schema_migrations) — se crea sola si falta.
 * No confundir con `pnpm db:migrate` (Drizzle). */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const root = process.cwd();
const mode = process.argv.includes("--baseline")
  ? "baseline"
  : process.argv.includes("--dry-run")
    ? "dry-run"
    : "migrate";

const loadEnvLocal = () => {
  const p = path.join(root, ".env.local");
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

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Falta DATABASE_URL (.env.local o entorno)");
  process.exit(1);
}

const ordenPath = path.join(root, "supabase/orden.json");
/** @type {string[]} */
const orden = JSON.parse(fs.readFileSync(ordenPath, "utf8"));
const tracker = "security-fixes-13.sql";
if (!orden.includes(tracker)) {
  /* El tracker se aplica primero aunque no esté en orden.json aún. */
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const ensureTracker = async () => {
  const sql = fs.readFileSync(
    path.join(root, "supabase", tracker),
    "utf8",
  );
  await client.query(sql);
};

await ensureTracker();

const { rows: appliedRows } = await client.query(
  "select archivo from public.cicalino_schema_migrations",
);
const applied = new Set(appliedRows.map((r) => r.archivo));

const fullOrden = orden.includes(tracker) ? orden : [tracker, ...orden];
const pendientes = fullOrden.filter((f) => !applied.has(f));

if (pendientes.length === 0) {
  console.log("Nada pendiente: la DB está al día según orden.json");
  await client.end();
  process.exit(0);
}

console.log(
  mode === "baseline"
    ? `Baseline: marcar ${pendientes.length} script(s) como aplicados (sin ejecutar)`
    : mode === "dry-run"
      ? `Dry-run: ${pendientes.length} pendiente(s)`
      : `Migrar: ${pendientes.length} pendiente(s)`,
);

for (const archivo of pendientes) {
  const full = path.join(root, "supabase", archivo);
  if (!fs.existsSync(full)) {
    console.error(`Falta archivo: ${archivo}`);
    await client.end();
    process.exit(1);
  }
  if (mode === "dry-run") {
    console.log(`  · ${archivo}`);
    continue;
  }
  process.stdout.write(`→ ${archivo} ... `);
  try {
    await client.query("begin");
    if (mode === "migrate" && archivo !== tracker) {
      await client.query(fs.readFileSync(full, "utf8"));
    }
    await client.query(
      `insert into public.cicalino_schema_migrations (archivo)
       values ($1) on conflict (archivo) do nothing`,
      [archivo],
    );
    await client.query("commit");
    console.log(mode === "baseline" ? "MARKED" : "OK");
  } catch (e) {
    await client.query("rollback");
    console.log("FAIL");
    console.error(e instanceof Error ? e.message : e);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log("Listo.");

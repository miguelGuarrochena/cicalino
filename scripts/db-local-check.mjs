/**
 * Migraciones + test:db contra una base LOCAL, nunca la de .env.local.
 *
 * Uso (con `supabase start` corriendo; puerto de supabase/config.toml):
 *   pnpm test:db:local
 *   LOCAL_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55422/postgres pnpm test:db:local
 *
 * `pnpm db:sql` y `pnpm test:db` leen DATABASE_URL de .env.local, que apunta
 * a la base de producción. Este script pisa DATABASE_URL en el entorno de los
 * procesos hijos (los dos respetan una variable ya definida) y se niega a
 * arrancar si el host no es loopback. Así una verificación local no puede
 * terminar escribiendo afuera por un .env mal copiado. */
import { spawnSync } from "node:child_process";

const url =
  process.env.LOCAL_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55422/postgres";

let host = "";
try {
  host = new URL(url).hostname;
} catch {
  console.error("LOCAL_DATABASE_URL no es una URL de Postgres válida");
  process.exit(1);
}
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
  console.error(`Rechazado: ${host} no es loopback. Este script solo corre contra una base local.`);
  process.exit(1);
}

/* RUN_MESA_SYNC_DB: las pruebas que escriben filas, seguras en una base local. */
const env = { ...process.env, DATABASE_URL: url, PGSSL: "0", RUN_DB_CHECKS: "1", RUN_MESA_SYNC_DB: "1" };
const correr = (cmd, args) => {
  console.log(`\n$ ${cmd} ${args.join(" ")}   (DATABASE_URL host=${host})`);
  const r = spawnSync(cmd, args, { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

correr(process.execPath, ["scripts/db-migrate.mjs"]);
correr(process.execPath, [
  "node_modules/vitest/vitest.mjs",
  "run",
  "--config",
  "vitest.integration.config.ts",
  ...process.argv.slice(2),
]);

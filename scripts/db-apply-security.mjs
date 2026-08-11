/**
 * Aplica security-fixes-05..N pendientes vía DATABASE_URL.
 *
 * Uso:
 *   node scripts/db-apply-security.mjs
 *   node scripts/db-apply-security.mjs --from=12
 *
 * Lee DATABASE_URL de .env.local (o del entorno). Idempotente.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const root = process.cwd();

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

const fromArg = process.argv.find((a) => a.startsWith("--from="));
const from = fromArg ? Number(fromArg.split("=")[1]) : 5;
if (!Number.isFinite(from) || from < 1) {
  console.error("--from debe ser un número >= 1");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Falta DATABASE_URL (.env.local o entorno)");
  process.exit(1);
}

const files = fs
  .readdirSync(path.join(root, "supabase"))
  .filter((f) => /^security-fixes-\d+\.sql$/.test(f))
  .map((f) => {
    const n = Number(f.match(/security-fixes-(\d+)/)?.[1]);
    return { n, file: f, full: path.join(root, "supabase", f) };
  })
  .filter((x) => Number.isFinite(x.n) && x.n >= from)
  .sort((a, b) => a.n - b.n);

if (files.length === 0) {
  console.log(`No hay security-fixes >= ${from}`);
  process.exit(0);
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
for (const { file, full } of files) {
  process.stdout.write(`→ ${file} ... `);
  try {
    await client.query("begin");
    await client.query(fs.readFileSync(full, "utf8"));
    await client.query("commit");
    console.log("OK");
  } catch (e) {
    await client.query("rollback");
    console.log("FAIL");
    console.error(e instanceof Error ? e.message : e);
    await client.end();
    process.exit(1);
  }
}
await client.end();
console.log(`Listo: ${files.length} script(s) aplicados.`);

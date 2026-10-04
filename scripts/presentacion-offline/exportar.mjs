#!/usr/bin/env node
/* Copia local de /como-funciona, para abrirla en la Mac sin internet.
 *
 *   pnpm build                  (el de siempre)
 *   pnpm presentacion:exportar  (esto)
 *   pnpm presentacion           (la abre en el navegador)
 *
 * No es otra app: toma la página que `next build` ya dejó prerenderizada
 * (/como-funciona es estática) y los archivos del build, y los pone en
 * `presentacion-offline/` junto con un servidorcito sin dependencias. La
 * carpeta se puede copiar a cualquier lado (el Escritorio, un pendrive): para
 * abrirla alcanza con Node, o con doble clic en "Abrir presentación.command".
 *
 * Hace falta servirla y no abrir el HTML con doble clic porque Next pide sus
 * archivos con rutas absolutas (/_next/...), que con file:// no existen. */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, chmodSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const next = join(raiz, ".next");
const salida = join(raiz, "presentacion-offline");

const fallar = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

if (!existsSync(join(next, "BUILD_ID"))) {
  fallar("No hay build. Corré primero `pnpm build`.");
}

/* Next deja la página estática como HTML en el server del build. */
const html = join(next, "server", "app", "como-funciona.html");
if (!existsSync(html)) {
  fallar(
    "El build no tiene /como-funciona prerenderizada (.next/server/app/como-funciona.html).\n" +
      "  ¿La ruta dejó de ser estática? En la salida de `next build` tiene que figurar con ○.",
  );
}

/* Adónde lleva "Ver el producto real" desde la copia: al Cicalino de verdad,
 * que para eso sí hace falta internet. */
const appUrl = (() => {
  const v = process.env.NEXT_PUBLIC_APP_URL;
  return v && v.startsWith("https://") ? v.replace(/\/$/, "") : "https://www.cicalino.net";
})();

rmSync(salida, { recursive: true, force: true });
mkdirSync(salida, { recursive: true });

writeFileSync(join(salida, "como-funciona.html"), readFileSync(html));
cpSync(join(next, "static"), join(salida, "_next", "static"), { recursive: true });

/* Lo de /public que la página pide: favicon, tema, imágenes. El service
 * worker queda afuera a propósito: en la copia local no hace falta y solo
 * traería cachés viejas. */
const publico = join(raiz, "public");
for (const nombre of readdirSync(publico)) {
  if (nombre === "sw.js" || nombre.startsWith(".")) continue;
  cpSync(join(publico, nombre), join(salida, nombre), { recursive: true });
}
for (const nombre of ["favicon.ico", "icon.png", "apple-icon.png"]) {
  const origen = join(raiz, "src", "app", nombre);
  if (existsSync(origen)) cpSync(origen, join(salida, nombre));
}

cpSync(join(dirname(fileURLToPath(import.meta.url)), "servidor.mjs"), join(salida, "servidor.mjs"));
writeFileSync(
  join(salida, "config.json"),
  JSON.stringify({ appUrl, exportado: new Date().toISOString(), build: readFileSync(join(next, "BUILD_ID"), "utf8").trim() }, null, 2),
);

/* Doble clic en Finder: abre la Terminal, levanta el servidor y el navegador. */
const comando = join(salida, "Abrir presentación.command");
writeFileSync(comando, '#!/bin/bash\ncd "$(dirname "$0")"\nnode servidor.mjs\n');
chmodSync(comando, 0o755);

const peso = (dir) =>
  readdirSync(dir, { withFileTypes: true }).reduce(
    (t, e) => t + (e.isDirectory() ? peso(join(dir, e.name)) : statSync(join(dir, e.name)).size),
    0,
  );

console.log(`
✓ Presentación exportada en presentacion-offline/ (${(peso(salida) / 1024 / 1024).toFixed(1)} MB)

  Para abrirla:   pnpm presentacion
  o doble clic en presentacion-offline/Abrir presentación.command

  "Ver el producto real" lleva a ${appUrl}/panel (eso sí necesita internet).
`);

#!/usr/bin/env node
/* Servidor de la copia local de /como-funciona. Sin dependencias: solo Node.
 *
 * Sirve la carpeta en la que está (la que arma `pnpm presentacion:exportar`)
 * en http://localhost:4321 y abre el navegador. No necesita internet.
 *
 *   node servidor.mjs              → abre el navegador
 *   node servidor.mjs --no-abrir   → solo sirve
 *   PORT=5000 node servidor.mjs    → otro puerto */

import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const raiz = dirname(fileURLToPath(import.meta.url));
const puerto = Number(process.env.PORT) || 4321;
const config = (() => {
  try {
    return JSON.parse(readFileSync(join(raiz, "config.json"), "utf8"));
  } catch {
    return {};
  }
})();
const appUrl = config.appUrl || "https://www.cicalino.net";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/* Todo lo que no es la presentación es el producto real: va al sitio. */
const AL_SITIO = ["/panel", "/login", "/probar", "/pricing", "/faq", "/admin"];

const servidor = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let ruta = decodeURIComponent(url.pathname);

  if (ruta === "/" || ruta === "/como-funciona/") {
    res.writeHead(302, { Location: "/como-funciona" });
    return res.end();
  }
  if (AL_SITIO.some((p) => ruta === p || ruta.startsWith(`${p}/`))) {
    res.writeHead(302, { Location: `${appUrl}${ruta}${url.search}` });
    return res.end();
  }
  if (ruta === "/como-funciona") ruta = "/como-funciona.html";

  /* Lo que el layout del sitio pide en producción y acá no tiene sentido (el
   * service worker de la app y las métricas de Vercel): respuestas vacías, así
   * la consola queda limpia y nada espera a la red. */
  if (ruta === "/sw.js" || ruta.startsWith("/_vercel/")) {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
    return res.end("/* copia local de la presentación */\n");
  }

  /* Nada fuera de esta carpeta. */
  const archivo = normalize(join(raiz, ruta));
  if (!archivo.startsWith(raiz + sep) || !existsSync(archivo) || !statSync(archivo).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("No está en la copia local.");
  }

  const inmutable = ruta.startsWith("/_next/static/");
  res.writeHead(200, {
    "Content-Type": TIPOS[extname(archivo)] ?? "application/octet-stream",
    "Cache-Control": inmutable ? "public, max-age=31536000, immutable" : "no-cache",
  });
  createReadStream(archivo).pipe(res);
});

servidor.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n✗ El puerto ${puerto} está ocupado. ¿Ya está abierta? Si no, probá con PORT=5000 node servidor.mjs\n`);
  } else {
    console.error(e);
  }
  process.exit(1);
});

servidor.listen(puerto, "127.0.0.1", () => {
  const direccion = `http://localhost:${puerto}/como-funciona`;
  console.log(`\nCicalino · presentación sin conexión\n\n  ${direccion}\n\n  (Ctrl+C para cerrar)\n`);
  if (!process.argv.includes("--no-abrir")) {
    const abrir = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    spawn(abrir, [direccion], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  }
});

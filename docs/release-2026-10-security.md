# Tanda de octubre 2026: cierre de mesa + dependencias corregidas

Rama: `security/next-16.4-node-22`, sobre `feature/supabase-data-api-grants`.
Incluye los dos commits funcionales de esa rama (`b9af505`, `cca1472`) y la
actualización de dependencias de este documento. Nada de esto está pusheado
ni desplegado, y la migración no se aplicó en producción.

## Qué se corrigió y por qué

Fuentes: los advisories de [vercel/next.js](https://github.com/vercel/next.js/security/advisories),
el [aviso de Node.js del 21/10/2026](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
y `pnpm audit` (base de GitHub Advisories) del 24/10/2026.

| Componente | Antes | Ahora | Por qué afectaba a Cicalino |
| --- | --- | --- | --- |
| `next` | 16.2.11 | 16.4.3 | DoS en Server Actions (GHSA-p3m5, alto): la app usa Server Actions. RCE en la optimización de imágenes con SVG (CVE-2026-96889) y AVIF (GHSA-2xp9), y SSRF de la misma API (CVE-2026-94483): la app usa `next/image`, así que `/_next/image` está activo (sin `remotePatterns` ni `dangerouslyAllowSVG`). En Vercel la optimización puede correr en su propio servicio y no en el `sharp` de la app; no lo verifiqué, así que se trata como expuesto. RCE en `use cache` (GHSA-673q) y en `next/og` (CVE-2026-94545): no aplicaban (no se usan), quedan corregidos igual. |
| `sharp` (vía `next`) | 0.34.5 | 0.35.5 | Requisito de la corrección de SVG. |
| `eslint-config-next` | 16.3.0 | 16.4.3 | Va con `next`. |
| `@sentry/nextjs` | 10.69.0 | 10.76.2 | GHSA-mchm (crítico en la base, sin exposición real acá): con `tunnelRoute` el SDK salteaba el middleware en todo lo que empezara con esa ruta. Solo afecta builds con webpack; `next build` usa Turbopack, ninguna ruta cuelga de `/monitoring` y la autorización no vive solo en el middleware. Se actualiza para que `pnpm audit` quede limpio y por si algún día se compila con webpack. |
| `zod` | 3.25.76 | 4.6.7 | GHSA-mrhx (alto): validar un array grande sin tope de largo podía agotar la memoria. Solo está corregido en 4.6.6+. |
| `vitest` (dev) | 3.2.7 | 4.1.12 | Path traversal e inyección en `@vitest/mocker`; trae `tinypool` 2.x (prototype pollution → RCE en `<2.1.2`). |
| `drizzle-kit` (dev) | 0.31.10 | 0.31.11 | Último parche. |
| Transitivas | — | ver `pnpm.overrides` | `postcss`, `nanoid`, `source-map-js`, `fast-uri`, `brace-expansion` (1.x y 5.x), `js-yaml`, `vite`, `esbuild` y el `zod` 3 que traía `eslint-plugin-react-hooks`. Cada override está acotado al rango vulnerable y sube al parche corregido de la misma versión mayor (salvo zod, que va a 4). |
| Node.js | `engines >=20.9.0`, CI `22` | `engines 22.x`, `.nvmrc 22.23.4`, CI lee `.nvmrc` | CVE-2026-111497 (RCE en Brotli) y otros tres altos; 20.x está fuera de soporte y no recibe parches. |

Resultado: `pnpm audit` (producción y desarrollo) sin vulnerabilidades conocidas.

### Cambios de código que trajo zod 4

- `required_error` / `invalid_type_error` / `errorMap` → `error`
  (`src/lib/schemas/common.ts`, `src/lib/schemas/index.ts`). Mismos textos
  para cada caso: falta el campo, tipo inválido, valor de enum inválido.
- `uuid` y los ids de empleado (`src/lib/actions/team.ts`) pasan a `z.guid()`.
  zod 4 hizo estricto `.uuid()` (RFC 9562); `guid` es el formato
  8-4-4-4-12 que aceptaba zod 3, así ningún id que hoy pasa deja de pasar.
  La autorización sigue decidiéndose en la base.
- `.email()` usa la expresión de zod 4: acepta los mails comunes; rechaza
  partes locales entre comillas y dominios con caracteres no ASCII.
- `next.config.ts` importa `withSentryConfig` de `@sentry/nextjs/config`.

### Lo que queda igual a propósito

- El archivo `src/middleware.ts`: Next 16.4 avisa que la convención pasa a
  llamarse `proxy`, pero sigue funcionando. Renombrarlo es un cambio aparte.
- La clasificación de rutas del build (dinámicas con nonce de CSP: `/p`, `/e`,
  `/m`, `/aceptar`, `/admin`, `/recuperar`; el resto estáticas) no cambió.

## Verificación (24/10/2026)

Todo local. Integración contra el Supabase local (`supabase_db_cicalino`,
`127.0.0.1:55422`) con `node scripts/db-local-check.mjs`, que rechaza hosts
que no sean loopback.

| Comando | Resultado |
| --- | --- |
| `vitest run` (unit) | 139 archivos, 1482 tests (incluye `tests/unit/zod4-mensajes.test.ts`) |
| `node scripts/db-local-check.mjs` (migraciones + integración) | sin pendientes; 13 archivos, 185 tests |
| `tsc --noEmit` | sin errores |
| `eslint src tests scripts --quiet` y `eslint . --quiet` | sin errores |
| `next build` (Next 16.4.3, Turbopack) | compila |
| `pnpm audit` | sin vulnerabilidades conocidas |

La máquina local corre Node 22.16.0 (anterior al parche); el CI corre la
versión de `.nvmrc`.

## Migración de base

`supabase/table-close-waits-for-kitchen.sql` (en `b9af505`) es la única
migración nueva. Reemplaza `_revisar_cobertura` y el trigger
`pedidos_revisar_cobertura` y agrega `_sesion_cocina_pendiente`. No altera
tablas ni datos; es idempotente. Al recrear el trigger toma un lock corto
sobre `pedidos`. Va después de `mesa-ocupacion-pedidos.sql` y antes de
`data-api-grants.sql` en `orden.json`.

Compatibilidad: el código nuevo funciona con la base sin la migración, y la
base migrada funciona con el código viejo (solo que el detalle de una mesa
pagada no muestra los botones de cocina). Orden recomendado: código primero.

Vuelta atrás: correr de nuevo `mesa-cierre-al-pagar.sql` y
`mesa-consistencia-cobros.sql`, que restauran las versiones anteriores de la
función y del trigger. `_sesion_cocina_pendiente` puede quedar (no la usa nadie
más).

## Despliegue, paso a paso

Mergear a `main` despliega a producción solo (integración de Vercel con
GitHub). Cada paso necesita autorización.

1. Push de `security/next-16.4-node-22` y PR a `main`. El push crea un
   Preview y el CI corre typecheck, lint, tests y build con Node de `.nvmrc`.
2. En Vercel → Project Settings → General → Node.js Version: confirmar 22.x
   (con `engines: 22.x` Vercel usa la última 22 que tenga).
3. Probar el Preview: crear un pedido desde un QR de mostrador, copiar y abrir
   su link, marcarlo listo desde el panel; en una mesa de Pagos, pedir, cobrar
   todo con un pedido sin anotar y comprobar que la mesa queda "pagada" hasta
   anotarlo. Revisar `/faq`, `/privacy` y `/terms`.
4. Merge del PR → deployment de producción. Revisar el estado del deployment
   y los logs de las primeras operaciones.
5. Antes de migrar, leer el historial de producción en solo lectura:
   `pnpm db:sql -- --dry-run` (se conecta a la base de `.env.local`; desde
   `fix/db-sql-dry-run-readonly` abre la sesión en solo lectura y no corre el
   tracker, antes ejecutaba `security-fixes-13.sql` también en dry-run). Tiene que
   listar como pendiente solo `table-close-waits-for-kitchen.sql` (si aparece
   `mesa-ocupacion-pedidos.sql`, falta aplicar ese primero).
6. Aplicar en un momento de poco movimiento: `pnpm db:sql`, y después el
   bloque de chequeo del final del script (esperado: `true, true` y la cantidad
   de sesiones de hoy cerradas con un pedido sin anotar).

## Pendiente

- Prueba física de los avisos en iPhone (agregar a la pantalla de inicio,
  aceptar el permiso, recibir el listo).
- Revisión legal de los textos nuevos de privacidad y términos.
- Actualizar Node en la máquina de desarrollo a 22.23.4 o posterior.
- Renombrar `middleware.ts` a `proxy.ts` (aviso de Next 16.4).

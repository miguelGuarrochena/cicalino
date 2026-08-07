# Cicalino 🔔

Avisador de pedidos por **QR** para negocios gastronómicos chicos en Argentina
(cafeterías, panaderías, rotiserías, heladerías). Reemplaza los buzzers /
avisadores físicos: el cliente escanea un QR con la cámara del celular (sin
instalar nada) y recibe un aviso en el navegador cuando su pedido está listo
para retirar.

Gratis para el cliente final; el local paga una tarifa fija por sucursal.

- **Dominio:** [cicalino.net](https://www.cicalino.net)
- **Mercado:** Argentina

---

## Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS 4** (tema por CSS, mobile-first)
- **Zustand 5** para estado del cliente (persistido donde corresponde)
- **Supabase** — Postgres + Auth + Realtime (+ RLS)
- **Drizzle ORM** — schema tipado y migraciones (la app en runtime usa el
  cliente de Supabase; Drizzle sirve para modelar / migrar)
- **qrcode** para generar el QR del pedido
- Tipografías **Archivo** + **Archivo Black**
- Tema **claro / oscuro / sistema** e i18n **ES / EN**
- **Web Push** (VAPID) + polling en la vista del cliente
- **Mercado Pago** — etapa posterior (hoy el alta es por contacto)

---

## Puesta en marcha

```bash
pnpm install
cp .env.example .env.local   # completar valores reales (NO se commitea)
pnpm dev                     # http://localhost:3000
```

Backend: seguí **`docs/supabase.md`** (proyecto, env, `setup.sql`,
`security-fixes-01/02/03.sql`, superadmin).

### Scripts

```bash
pnpm dev         # desarrollo
pnpm build       # build de producción
pnpm start       # servir el build
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm test:run    # tests unitarios
pnpm db:studio   # explorador visual
pnpm db:pull     # regenerar el schema desde la base (usa DATABASE_URL)
```

### Cómo se cambia el schema

**La fuente de verdad es `supabase/*.sql`, no Drizzle.** Todo cambio de
estructura se escribe como un script en esa carpeta y se corre a mano desde el
SQL Editor de Supabase. Los scripts son idempotentes y suelen empezar con un
bloque de chequeo que hay que leer antes de seguir.

`src/lib/db/schema.ts` va detrás: existe para que TypeScript conozca las
tablas, y se actualiza a mano cuando se agrega una columna.

> `pnpm db:push` ya no está. Comparaba el archivo contra la base y aplicaba la
> diferencia, así que con el schema desactualizado —lo estuvo mucho tiempo—
> borraba en producción las columnas que faltaban en el archivo.

Para verificar que el archivo y la base siguen coincidiendo:
`supabase/chequeo-schema.sql`.

---

## Variables de entorno

Plantilla: `.env.example`. Valores reales: `.env.local` / Vercel.

| Variable | Descripción |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publishable (browser) |
| `SUPABASE_SECRET_KEY` | Secret / service role (solo server) |
| `DATABASE_URL` | Connection string (migraciones Drizzle) |
| `NEXT_PUBLIC_APP_URL` | URL pública (links del QR) |
| `NEXT_PUBLIC_VAPID_*` / `VAPID_*` | Web Push |
| `UPSTASH_REDIS_REST_*` | Rate limit global (opcional) |

---

## Roles

- **Superadmin (Cicalino):** orgs, cupo, cobros, demo. Área: `/admin`.
- **Admin (dueño):** sucursales, config, empleados, métricas. `/panel`.
- **Supervisor:** una sucursal, sin métricas globales.
- **Empleado:** PIN en el dispositivo del mostrador (hash en la base).

---

## Rutas

| Ruta | Qué es |
| --- | --- |
| `/` | Landing |
| `/pricing` | Precio + contacto |
| `/panel` | Pedidos + QR |
| `/panel/metrics` | Métricas (admin) |
| `/panel/config` | Config + empleados |
| `/p/[token]` | Cliente (espera / listo) |
| `/admin` | Superadmin |
| `/login` · `/faq` · `/probar` · `/terms` · `/privacy` | Auxiliares |

---

## Docs

- `docs/supabase.md` — backend, RLS, security SQL, demo
- `docs/architecture.md` — roles y flujo
- `docs/business.md` — producto y cobro

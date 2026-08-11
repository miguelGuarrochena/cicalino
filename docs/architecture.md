# Cicalino — Arquitectura

## Principios

- **Mobile-first**: la vista del cliente siempre se ve desde el celular.
- **Cero fricción para el cliente**: sin registro, sin instalar apps.
- **Separación clara** entre panel del local, vista del cliente y lógica
  compartida.
- **Serverless-friendly**: Supabase (Postgres + Auth + Realtime) + Next App
  Router + Vercel Cron.

## Estructura de carpetas

```
cicalino/
├── src/
│   ├── app/
│   │   ├── layout.tsx / page.tsx / globals.css
│   │   ├── (app)/panel/          # panel: pedidos, espera, metrics, config
│   │   ├── (customer)/           # /p/[token] pedidos · /e/[token] espera
│   │   ├── admin/                # superadmin
│   │   ├── aceptar/[token]/      # aceptación de contrato
│   │   ├── api/
│   │   │   ├── p|e/[token]/      # estado cliente (service_role + rate limit)
│   │   │   ├── push/             # subscribe + notify
│   │   │   └── cron/cobros/      # cobros, mails, expiraciones (CRON_SECRET)
│   │   ├── robots.ts / sitemap.ts
│   │   └── login|pricing|probar|faq|privacy|terms
│   ├── components/{panel,customer,admin,landing,ui}/
│   └── lib/
│       ├── actions/              # Server Actions autenticadas
│       ├── server/               # helpers privilegiados (server-only)
│       ├── data/                 # lecturas/escrituras del panel (RLS)
│       ├── security/             # CSP, rate limit, Turnstile, IP
│       ├── db/schema.ts          # tipado Drizzle (no es la fuente de verdad)
│       ├── supabase/             # client / server / admin
│       └── store/                # Zustand (demo + sesión/config)
├── public/sw.js                  # service worker Web Push
├── supabase/                     # SQL manual + security-fixes-*.sql
├── docs/
└── tests/unit/
```

## Capas de acceso

```
Cliente QR (/p|/e/[token])
  → Route Handler (service_role + rate limit Upstash en prod)
  → Postgres

Panel (/panel*)
  → Browser Supabase (anon + sesión) + RLS
  → Realtime + polling de respaldo
  → RPCs SECURITY DEFINER con puede_ver_local / local_operativo

Superadmin (/admin)
  → Server Actions + admin client (service_role) con check de rol

Cron (Vercel)
  → Bearer CRON_SECRET + cron_locks (token de ownership)
  → sweepSubscriptions / billingReminders / expiraciones
```

La fuente de verdad del schema es `supabase/*.sql` (scripts idempotentes a
mano). Drizzle tipa y documenta; no es el runtime de migraciones. Ver
`docs/supabase.md` y `chequeo-migraciones.sql`.

## Modelo de datos

Ver `src/lib/db/schema.ts` y los scripts en `supabase/`:

- **organizaciones** — cobro, plan, suscripción, contrato (`contrato_token` +
  TTL), módulos contratados.
- **locales** — sucursales; `modo_identificacion`, `hora_corte`, módulos por
  sucursal, `activa` / corte por impago vía `local_operativo`.
- **pedidos** — `referencia` (asignada atómicamente con `crear_pedido` en modo
  turno), estados, `qr_token` UUID, timestamps.
- **esperas / reservas / mesas** — módulo cola; transiciones en DB.
- **empleados** — PIN hasheado (`pin_hash`); la UI solo ve `tiene_pin`.
- **usuarios** + **usuario_sucursal** — login; escritura de acceso solo
  admin/SA.
- **push_subscriptions** — Web Push por pedido o espera.
- **cron_locks** — evita corridas solapadas del cron.

### Métricas (derivadas de timestamps)

- Preparación: `listo_en − creado_en`.
- Retiro: `retirado_en − listo_en`.
- Volumen por día/hora sobre `creado_en` (RPC `metricas_*`).

## Flujo del aviso al cliente

1. El panel marca el pedido **listo** (update RLS + opcional
   `POST /api/push/notify`).
2. Web Push (VAPID) → `public/sw.js`.
3. Fallback: polling a `GET /api/p/[token]` (y `/api/e/[token]` en espera),
   con intervalos adaptativos.

## Seguridad (resumen)

- QR: `crypto.randomUUID()`, único, expira a fin de jornada (`qr_expira_en`).
- Cliente: solo datos mínimos; nunca service_role en el browser.
- Rate limit compartido (Upstash obligatorio en Vercel production).
- Privileged helpers (`subscriptionSweep`, billing, contract link) viven en
  `lib/server` con `import "server-only"`, no como Server Actions públicas.
- RPCs admin (`purgar_push_viejas`, cron locks, `cola_de_espera`) solo
  `service_role`.
- Contrato `/aceptar/[token]`: TTL 7 días + rate limit.
- CSP: Report-Only por defecto; `CSP_ENFORCE=1` cuando la consola esté limpia.

## Modelo: organización → sucursales

- **Organización** — unidad de cobro (admin/dueño, cupo, plan).
- **Sucursal (`locales`)** — punto de venta; modo, mesas, empleados.
- **Pedidos / esperas / reservas** cuelgan de `local_id`.

## Roles

- **Superadmin** — `/admin`: altas, cobros, impersonar dueño.
- **Admin** — `/panel` + config: sucursales hasta el cupo, equipo, métricas.
- **Supervisor** — una sucursal (vía `usuario_sucursal`); sin métricas globales.
- **Empleado** — PIN en el mostrador; no es usuario Auth.

## Identificación del pedido

Modo por local: `pedido` (turno atómico), `nombre` o `mesa`. Los pedidos no
se borran; el QR expira al cierre de jornada.

## Pendiente

- Migraciones deterministas: `supabase/orden.json` + `pnpm db:sql` /
  `pnpm db:sql:baseline` (tabla `cicalino_schema_migrations`). Queda formalizar
  el flujo tipo Supabase CLI a largo plazo.
- Más tests de integración (RLS cross-tenant, API QR, cron end-to-end).
  Smoke de grants: `pnpm test:db`.
- `CSP_ENFORCE=1` en producción cuando no haya violaciones.
- Mercado Pago automatizado si el volumen lo justifica.

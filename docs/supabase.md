# Backend con Supabase — puesta en marcha

Cicalino usa **Supabase** para base de datos, **auth** (login por email + contraseña)
y **realtime** (sync de pedidos entre dispositivos/cajas).

Mientras no haya credenciales, la app corre en **modo demo** (stores de Zustand,
sin base ni login). Apenas cargás las variables, se activa el backend real.

## 1. Crear el proyecto

1. Entrá a [supabase.com](https://supabase.com) → **New project** (elegí región cercana, ej. São Paulo).
2. Guardá la contraseña de la base.
3. En **Settings → API** copiá: `Project URL`, `anon public` y `service_role`.
4. En **Settings → Database → Connection string** copiá la del **pooler**.

## 2. Variables de entorno

Copiá `.env.example` a `.env.local` y completá:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # segura para el navegador
SUPABASE_SECRET_KEY=sb_secret_...                         # SOLO server, nunca al cliente
DATABASE_URL=postgresql://postgres:PASSWORD@db.TU-PROYECTO.supabase.co:5432/postgres
```

> Nombres nuevos de Supabase: **publishable** = la vieja `anon`; **secret** = la vieja
> `service_role`. Si tu password tiene caracteres especiales (`& @ : / ?`), codificalos
> en la URL (por ej. `&` → `%26`).
>
> `drizzle-kit` no lee `.env.local` por su cuenta: `drizzle.config.ts` lo carga con
> `dotenv`, así que corré `pnpm install` (agregamos esa dependencia) antes de migrar.

## 3. Crear las tablas

Las migraciones ya están generadas desde el schema de Drizzle:

```bash
pnpm db:migrate     # aplica drizzle/*.sql a la base
# (o pnpm db:push para empujar el schema directo en desarrollo)
```

## 4. Auth + RLS + Realtime

En **Supabase → SQL Editor**, pegá y corré `supabase/setup.sql`. Eso:

- vincula la tabla `usuarios` (perfil) con `auth.users`,
- crea el trigger que arma el perfil al invitar a alguien,
- define las **policies de RLS** (cada dueño ve su organización; el superadmin, todo),
- habilita **realtime** en `pedidos`.

En **Authentication → Providers → Email**: dejá habilitado *Email*, y
**desactivá "Enable signups"** (no hay registro público; solo invitación).

## 5. Crear el superadmin (vos)

En **Authentication → Users → Add user** (o por invitación), creá tu usuario.
Luego, en el SQL Editor:

```sql
update public.usuarios set rol = 'superadmin' where email = 'TU_EMAIL';
```

## 6. Flujo de alta (ya cableado en el código)

- **Superadmin** da de alta una organización e **invita al dueño** por email
  (`invitarAdmin` → `supabase.auth.admin.inviteUserByEmail`, con `rol=admin` y su
  `organizacion_id` en el metadata). El dueño recibe un mail para poner su clave.
- **Admin (dueño)** entra, crea sus **sucursales** y carga **empleados** (con PIN).
- **Empleados** no tienen login: fichan con PIN en el dispositivo del mostrador.

## Archivos clave

- `src/lib/supabase/{client,server,admin}.ts` — clientes (browser / server / service_role).
- `src/lib/auth/actions.ts` — `signIn`, `signOut`, `invitarAdmin`.
- `src/lib/auth/profile.ts` — `getPerfilActual()` (rol + org + sucursal del logueado).
- `src/middleware.ts` — refresca sesión y protege `/panel` y `/admin`.
- `supabase/setup.sql` — RLS, trigger y realtime.

## Probar pedidos reales (panel + realtime)

El panel usa la base + realtime cuando el usuario logueado tiene una **sucursal
real** (`local_id`). Para armar una de prueba:

**1) Organización + sucursal** (SQL Editor). Devuelve los IDs:

```sql
with org as (
  insert into public.organizaciones (nombre, dueno_email)
  values ('Café Demo', 'dueno@cafedemo.com')
  returning id
)
insert into public.locales (organizacion_id, nombre, slug)
select id, 'Centro', 'centro' from org;
```

**2) Usuario dueño de prueba**: Authentication → Add user → email
`dueno@cafedemo.com` + contraseña. El trigger le crea la fila en `usuarios`.

**3) Linkear ese usuario a la sucursal:**

```sql
update public.usuarios u
set organizacion_id = l.organizacion_id,
    local_id        = l.id,
    rol             = 'admin'
from public.locales l
where l.slug = 'centro' and u.email = 'dueno@cafedemo.com';
```

**4) Entrar** con `dueno@cafedemo.com` → `/panel`. Crear un pedido queda en la
base; abrí el panel en dos dispositivos/pestañas y vas a ver que **se sincroniza
solo** (realtime). El superadmin no opera el panel (tiene su consola en `/admin`).

## Superadmin (ya cableado)

- El superadmin da de alta una organización desde `/admin`: se crea la org + sus
  sucursales e **invita al dueño por email** (server action con service_role, que
  valida rol superadmin). El dueño recibe un mail para poner su contraseña.
- Listar / pausar / marcar pagado / editar cupo / alta y baja de sucursales van
  contra la base (RLS: el superadmin ve y edita todo).
- "Entrar como dueño" usa el `id` real de la sucursal, así que abre su panel con
  pedidos reales.

Archivos: `src/lib/actions/superadmin.ts` (crear/eliminar), `src/lib/data/superadmin.ts`
(listar/actualizar/sucursales), `src/lib/hooks/useSuperadminSync.ts`.

## Web Push (VAPID) — avisos con la pestaña cerrada

1. Generá las claves: `npx web-push generate-vapid-keys` y ponelas en `.env.local`:

   ```
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
   VAPID_PRIVATE_KEY=...
   VAPID_SUBJECT=mailto:info@cicalino.net
   ```

2. Corré la línea nueva de `supabase/setup.sql` (habilita RLS en
   `push_subscriptions`).
3. Flujo: el cliente toca "Activar avisos" → se suscribe (`/api/push/subscribe`).
   Cuando el panel marca **listo**, llama a `/api/push/notify`, que valida por la
   sesión del dueño (RLS) y envía el push con `web-push`. El service worker
   (`public/sw.js`) muestra la notificación aunque la pestaña esté cerrada.

Archivos: `src/lib/push/server.ts`, `src/app/api/push/{subscribe,notify}/route.ts`,
`suscribirWebPush` en `src/lib/notifications.ts`.

## Pendiente (próximo)

- Sacar el modo demo al lanzar; tests E2E; deploy a Vercel; Mercado Pago (cobro).

## Archivos clave (backend de datos)

- `src/lib/data/orders.ts` — fetch/insert/update de pedidos + suscripción realtime.
- `src/lib/hooks/useOrders.ts` — decide demo (Zustand) vs live (Supabase) por sucursal.
- `src/lib/data/branch.ts` — config de la sucursal (`locales`) y empleados (`empleados`).
- `src/lib/hooks/useBranchConfigSync.ts` — carga config + empleados de la base al store.
  La config-store sigue siendo la fuente que lee la UI; con backend se hidrata y
  escribe en la base (guardar config, alta/baja de empleados con PIN).

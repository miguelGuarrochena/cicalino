# Backend con Supabase — puesta en marcha

Cicalino usa **Supabase** para base de datos, **auth** (login por email + contraseña)
y **realtime** (sync de pedidos entre dispositivos/cajas).

En **desarrollo**, si faltan credenciales, la app corre en **modo demo**
(Zustand). En **producción**, `/panel` y `/admin` responden 503 si faltan las
vars de Supabase (no se abre el panel sin backend).

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

# Opcional en Vercel (recomendado):
# UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  → rate limit global
# NEXT_PUBLIC_VAPID_* / VAPID_*                       → Web Push
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

## 4. Auth + RLS + Realtime + security fixes

En **Supabase → SQL Editor**, corré **en este orden**:

1. `supabase/setup.sql` — perfiles, trigger de invitación, RLS base, realtime.
2. `supabase/security-fixes-01.sql` — endurece RLS / `handle_new_user`.
3. `supabase/security-fixes-02.sql` — constraints de cupo y facturación.
4. `supabase/security-fixes-03.sql` — PIN hasheado (`pin_hash`) + RPCs
   `set_empleado_pin` / `verificar_pin_empleado`.

Sin el **#03**, el fichaje y el alta de empleados con PIN fallan (el front ya
habla por RPC, no lee `pin` en texto plano).

> No uses `pnpm db:push` a ciegas después de estos scripts: la columna
> `tiene_pin` es **GENERATED**. Si necesitás alinear Drizzle, usá
> `drizzle/0002_empleados_pin_hash.sql` o regenerá migraciones con cuidado.

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
- **Demo para ventas:** en `/admin` → **Abrir demo**. Crea (o reutiliza) la org
  `Cicalino Demo` / sucursal `Mostrador` (`demo@cicalino.net`) **sin invitar a
  nadie**, e impersona al panel. No hace falta invitarte a vos.

Archivos: `src/lib/actions/superadmin.ts` (crear/eliminar), `src/lib/data/superadmin.ts`
(listar/actualizar/sucursales), `src/lib/hooks/useSuperadminSync.ts`.

## Web Push (VAPID) — avisos con la pestaña cerrada

1. Generá las claves: `npx web-push generate-vapid-keys` y ponelas en `.env.local`:

   ```
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
   VAPID_PRIVATE_KEY=...
   VAPID_SUBJECT=mailto:info@cicalino.net
   ```

2. Corré en el SQL Editor (si aún no está):
   - la línea de `push_subscriptions` en `setup.sql`
   - `supabase/avisado-en.sql` (columna para re-avisar con la pestaña abierta)
   - `supabase/proximo-cobro.sql` (fechas de cobro + avisos al superadmin)
   - `supabase/contrato-aceptacion.sql` (token + aceptación de condiciones)
   - `supabase/solicitudes-tipo.sql` (prueba vs contratar plan)
   - `supabase/pedidos-sucursal.sql` (dueño pide +1 cupo / pago)
   - `supabase/realtime-organizaciones.sql` (Superadmin refresca al aceptar contrato)
   - `supabase/tipos-negocio.sql` (bar, restaurante, pastelería, food truck)
3. Flujo: el cliente toca "Activar avisos" → se suscribe (`/api/push/subscribe`).
   Cuando el panel marca **listo** (o **Volver a avisar**), llama a
   `/api/push/notify`: actualiza `avisado_en` (señal en pantalla) y, si hay
   VAPID + suscripción, manda el push aunque esté en otra app.

Archivos: `src/lib/push/server.ts`, `src/app/api/push/{subscribe,notify}/route.ts`,
`suscribirWebPush` en `src/lib/notifications.ts`.

## Pendiente (próximo)

- Upstash en Vercel (rate limit global); CSP_ENFORCE=1 cuando la consola esté limpia.
- Mercado Pago si el volumen lo justifica; tests E2E.

## Archivos clave (backend de datos)

- `src/lib/data/orders.ts` — fetch/insert/update de pedidos + suscripción realtime.
- `src/lib/hooks/useOrders.ts` — decide demo (Zustand) vs live (Supabase) por sucursal.
- `src/lib/data/branch.ts` — config de la sucursal (`locales`) y empleados (`empleados`).
- `src/lib/hooks/useBranchConfigSync.ts` — carga config + empleados de la base al store.
  La config-store sigue siendo la fuente que lee la UI; con backend se hidrata y
  escribe en la base (guardar config, alta/baja de empleados con PIN).

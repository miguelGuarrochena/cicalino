# Cicalino 🔔

Avisador de pedidos por **QR** para negocios gastronómicos chicos en Argentina
(cafeterías, panaderías, rotiserías, heladerías). Reemplaza los buzzers /
avisadores físicos: el cliente escanea un QR con la cámara del celular (sin
instalar nada) y recibe un aviso en el navegador cuando su pedido está listo
para retirar.

Gratis para el cliente final; el local paga una suscripción mensual chica.

- **Dominio:** cicalino.ar
- **Mercado:** Argentina (posible expansión a España)

---

## Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS 4** (tema por CSS, mobile-first)
- **Zustand 5** para estado del cliente (persistido en `localStorage` donde
  corresponde)
- **Drizzle ORM** + **Neon** (Postgres serverless) — modelo definido, conexión
  pendiente de cablear
- **qrcode** para generar el QR del pedido
- Tipografías **Archivo** + **Archivo Black** (Google Fonts)
- Tema **claro / oscuro / sistema** e i18n **ES / EN**
- **Web Push** (VAPID) + fallback a polling — a implementar
- **Mercado Pago** para la suscripción — etapa posterior

---

## Puesta en marcha

```bash
pnpm install
cp .env.example .env.local   # completar valores reales (NO se commitea)
pnpm dev                     # http://localhost:3000
```

> Nota: `node_modules` no se versiona. Si clonás el repo, corré `pnpm install`
> en tu máquina (los binarios nativos son por plataforma).

### Scripts

```bash
pnpm dev         # desarrollo
pnpm build       # build de producción
pnpm start       # servir el build
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit
pnpm db:generate # generar migraciones desde el schema (Drizzle)
pnpm db:migrate  # aplicar migraciones a Neon
pnpm db:push     # push del schema
pnpm db:studio   # explorador visual de la base
```

---

## Variables de entorno

Se versiona **solo** `.env.example` (plantilla). Los valores reales van en
`.env.local`, que está en `.gitignore`. **Nunca commitear** `.env*` con datos.

| Variable | Descripción |
| --- | --- |
| `DATABASE_URL` | Connection string de Neon (con pooling) |
| `NEXT_PUBLIC_APP_URL` | URL pública de la app (para armar los links del QR) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Claves Web Push (VAPID) |
| `VAPID_SUBJECT` | mailto de contacto para Web Push |
| `MP_ACCESS_TOKEN` / `MP_WEBHOOK_SECRET` | Mercado Pago (etapa posterior) |

---

## Roles y accesos

Tres niveles de acceso (ver `docs/arquitectura.md`):

- **Superadmin (Cicalino):** da de alta locales y sus admins; ve métricas
  globales (locales activos, MRR, impagos). Área: `/admin`.
- **Admin (dueño del local):** completa los datos del local, elige el modo de
  identificación, carga empleados y ve todas las métricas. Área: `/panel`.
- **Supervisor:** gestiona mesas/empleados **sin** ver métricas.
- **Empleado:** perfil con **PIN** (no es un usuario con contraseña); ficha en
  el dispositivo compartido, toma pedidos, genera el QR y cambia estados.

En el prototipo hay un **selector de rol** (arriba a la derecha del panel) para
previsualizar cada vista; en producción el rol viene del login.

---

## Rutas principales

| Ruta | Qué es |
| --- | --- |
| `/` | Landing (hero con la mascota) |
| `/precios` | Planes (Prueba / Base / Pro) y contacto |
| `/panel` | Pedidos del local (crear, cambiar estado, QR) |
| `/panel/metricas` | Métricas por período (día / semana / mes / año) — solo admin |
| `/panel/config` | Configuración del local, modo de identificación y empleados |
| `/p/[token]` | Vista pública del cliente tras escanear el QR |
| `/admin` | Panel de superadmin (locales, planes, pagos) |
| `/entrar`, `/faq`, `/precios`, `/terminos`, `/privacidad` | Marketing / auxiliares |

---

## Estructura

```
src/
├── app/
│   ├── layout.tsx            # providers (tema + i18n), fuentes, anti-flash
│   ├── page.tsx              # landing
│   ├── (local)/panel/        # panel del local (pedidos, métricas, config)
│   ├── (cliente)/p/[token]/  # vista del cliente (QR)
│   ├── admin/                # área de superadmin
│   ├── precios/ · faq/ · entrar/ · terminos/ · privacidad/
│   └── api/                  # route handlers (stubs hasta conectar Neon)
├── components/
│   ├── local/                # panel: PedidoCard, Fichaje, QrModal, PanelNav...
│   ├── cliente/              # EsperaCliente
│   ├── admin/                # LocalModal
│   ├── ui/                   # Controls, Logo, ThemedImg, ModalShell, Paginacion...
│   └── providers/            # Providers (tema + idioma, rehidratación de stores)
└── lib/
    ├── db/                   # schema (Drizzle) + conexión Neon
    ├── store/                # Zustand: pedidos, config, session, superadmin
    ├── i18n.ts               # diccionario ES/EN + translate()
    ├── validations.ts        # helpers de validación de formularios
    ├── types.ts · mock.ts · utils/token.ts
public/                       # logo, mascota, campanas (chef/ok), favicon, foto
docs/                         # negocio + arquitectura (roles, ciclo de vida)
```

---

## Modelo de datos (Drizzle / Neon)

- **locales** (tenant): datos del local, `modo_identificacion`
  (`pedido` / `nombre` / `mesa`), `cantidad_mesas`.
- **pedidos:** referencia, estado (creado → listo → retirado; + cancelado),
  timestamps por estado, `empleado_id`, `qr_token` + expiración diaria.
- **empleados:** nombre, rol, `pin`.
- **usuarios:** login real con rol (`superadmin` / `admin` / `supervisor`).
- **push_subscriptions:** suscripciones Web Push por pedido.

Los pedidos **no se borran**: quedan como historial. Solo el token del QR
expira a diario. Las métricas se calculan por rango sobre `pedidos`.

---

## Convenciones

- Funciones como **arrow functions**.
- Estado persistente con **Zustand** (`persist`, con `skipHydration` +
  rehidratación en el provider para evitar mismatches de SSR).
- Formularios con **validación** (ver `lib/validations.ts`).
- Colores/tamaños vía tokens de Tailwind (`bg-crema`, `text-marca`,
  `text-carbon`, `border-linea`…), que se invierten solos en modo oscuro.

---

## Estado actual

Front funcional con datos demo: landing, panel (pedidos + QR + fichaje),
métricas por período, configuración, vista del cliente, pricing y superadmin
(planes y pagos). Falta el **back**: conectar Neon, implementar los route
handlers, **login/auth** real por rol, **Web Push** (VAPID) y la integración de
**Mercado Pago**.

# Cicalino — Arquitectura

## Principios

- **Mobile-first**: la vista del cliente siempre se ve desde el celular.
- **Cero fricción para el cliente**: sin registro, sin instalar apps.
- **Separación clara** entre panel del local, vista del cliente y lógica
  compartida.
- **Serverless-friendly**: Neon (Postgres HTTP) + Next App Router.

## Estructura de carpetas

```
cicalino/
├── src/
│   ├── app/
│   │   ├── layout.tsx            # layout raíz (metadata, viewport, fuentes)
│   │   ├── page.tsx              # landing mínima
│   │   ├── globals.css          # tema Tailwind v4 (tokens de marca)
│   │   │
│   │   ├── (local)/             # ── route group: PANEL DEL LOCAL ──
│   │   │   └── panel/
│   │   │       ├── layout.tsx    # header + navegación del panel
│   │   │       ├── page.tsx      # lista de pedidos (crear / cambiar estado)
│   │   │       └── metricas/
│   │   │           └── page.tsx  # métricas del día
│   │   │
│   │   ├── (cliente)/           # ── route group: VISTA DEL CLIENTE ──
│   │   │   └── p/
│   │   │       └── [token]/
│   │   │           └── page.tsx  # pantalla de espera tras escanear el QR
│   │   │
│   │   └── api/                 # route handlers (stubs hasta conectar Neon)
│   │       ├── pedidos/route.ts              # GET lista / POST crear
│   │       ├── pedidos/[id]/estado/route.ts  # PATCH cambia estado
│   │       └── p/[token]/route.ts            # GET estado público del pedido
│   │
│   ├── components/
│   │   ├── local/               # componentes del panel (PedidoCard, ...)
│   │   ├── cliente/             # componentes de la vista del cliente
│   │   └── ui/                  # componentes compartidos (a futuro)
│   │
│   └── lib/                     # ── LÓGICA COMPARTIDA ──
│       ├── db/
│       │   ├── index.ts         # conexión a Neon (drizzle + neon-http)
│       │   └── schema.ts        # tablas Drizzle (locales, pedidos, push)
│       ├── store/
│       │   └── pedidos-store.ts # store de Zustand del panel
│       ├── utils/
│       │   └── token.ts         # generación / expiración del token del QR
│       ├── mock.ts              # datos demo para los prototipos
│       └── types.ts             # tipos de dominio compartidos
│
├── public/
│   └── sw.js                    # service worker Web Push (placeholder)
├── drizzle.config.ts            # config de migraciones
├── .env.example
└── next.config.ts
```

## Modelo de datos

Tres tablas (ver `src/lib/db/schema.ts`):

- **locales** (tenant): `id`, `nombre`, `tipo_negocio` (enum), `dueno`,
  `whatsapp`, `direccion`, `slug`, timestamps.
- **pedidos**: `id`, `local_id`, `referencia` (número/nombre), `estado`
  (creado → en_preparacion → listo → retirado), `qr_token` + `qr_expira_en`
  (expira a fin del día, se invalida solo), y un timestamp por cada cambio de
  estado (`creado_en`, `en_preparacion_en`, `listo_en`, `retirado_en`) para
  poder calcular las métricas.
- **push_subscriptions**: suscripción Web Push por pedido/navegador
  (`endpoint`, `p256dh`, `auth`) para empujar el aviso al pasar a "listo".

### Métricas (derivadas de los timestamps)

- **Tiempo de preparación**: `listo_en − creado_en`.
- **Tiempo de retiro**: `retirado_en − listo_en` (cuánto tarda el cliente en
  retirar después del aviso).
- **Volumen por día/hora**: agregación sobre `creado_en`.

## Flujo del aviso al cliente

1. El local marca el pedido como **listo** en el panel
   (`PATCH /api/pedidos/[id]/estado`).
2. El backend recorre las `push_subscriptions` del pedido y envía un
   **Web Push** (VAPID) → el service worker (`public/sw.js`) muestra la
   notificación.
3. **Fallback**: la pantalla del cliente hace **polling** a
   `GET /api/p/[token]` cada pocos segundos y se actualiza sola si el push no
   está disponible (permiso denegado, navegador sin soporte, etc.).

## Seguridad del token del QR

- Token aleatorio (`base64url`, 16 bytes) por pedido, **único**.
- **Expira a fin del día** (hora Argentina, UTC-3): se invalida solo.
- La vista del cliente solo expone datos mínimos (referencia, estado, nombre
  del local); nunca datos internos del local.

## Decisiones técnicas

- **Neon en vez de Supabase**: se llegó al límite de proyectos gratis en
  Supabase. Neon da Postgres serverless con driver HTTP ideal para Next.
- **Drizzle en vez de Prisma**: ORM liviano, TypeScript-first, migraciones
  simples, buen encaje con Neon.
- **Zustand**: estado del panel simple y sin boilerplate.
- **Tailwind v4**: configuración por CSS (`@theme` en `globals.css`), sin
  `tailwind.config.js`.

## Roles y permisos

Tres niveles de acceso:

- **Superadmin (Cicalino / nosotros)** — cuenta con login real. Da de alta cada
  local y crea su usuario admin; ve métricas globales (locales activos, pedidos,
  ingresos) y a futuro la facturación con Mercado Pago. **No** carga los datos
  del local. Área: `/admin`.
- **Admin (dueño del local)** — cuenta con login real. Completa los datos del
  local, elige el modo de identificación, carga a sus empleados (con PIN),
  gestiona la suscripción y ve todas las métricas, incluidas las de empleados y
  mesas. Área: `/panel` + `/panel/config`.
- **Empleado** — no es un usuario con contraseña: es un **perfil con PIN** dentro
  del local. En el dispositivo compartido del mostrador (logueado como admin),
  cada empleado **ficha** con su PIN para registrar quién atiende. Toma pedidos,
  genera el QR y cambia estados.

Cada pedido guarda el `empleadoId` de quien lo atendió (para métricas por
persona y trazabilidad, sobre todo en modo mesa).

Modelo de datos asociado: `usuarios` (rol superadmin/admin), `empleados`
(nombre, rol, pin), y `pedidos.empleado_id`.

### Identificación del pedido y ciclo de vida

- **Modo de identificación** configurable por local: `pedido` (turno), `nombre`
  (cliente) o `mesa`. El campo `referencia` guarda el valor; solo cambia la
  etiqueta que se muestra.
- **Los pedidos no se borran**: quedan con sus timestamps como historial. Lo
  único que se resetea a diario es el **token del QR** (expira a fin del día).
- **Métricas**: se calculan al vuelo desde `pedidos` por rango (día/semana/mes/
  año). Nada se pierde; a gran escala se puede pre-agregar por día.

### Entrega del QR al cliente

Al tomar el pedido se muestra el QR. Si la cámara no funciona, se puede mandar
el link por **WhatsApp**, **compartir** (share nativo del celular) o **copiar**.
NFC queda como opción premium para modo mesa (tag fijo por mesa).

## Pendiente (próximas etapas)

- Implementar los route handlers contra Neon.
- Web Push real: generar claves VAPID, suscripción desde la vista del cliente,
  envío desde el backend.
- Onboarding de locales + generación e impresión del QR.
- Integración de Mercado Pago (suscripción mensual).

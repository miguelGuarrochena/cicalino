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

Ver `src/lib/db/schema.ts`:

- **organizaciones** (empresa / cobro): `nombre`, `dueno_email`, `cupo`,
  `pagado`, datos fiscales. Cobro = `cupo × $20.000`.
- **locales** (sucursales): `organizacion_id`, `nombre`, `slug`,
  `tipo_negocio`, `modo_identificacion`, etc. Unidad operativa del panel.
- **pedidos**: `local_id`, `referencia`, `estado`
  (`creado → listo → retirado`, + `cancelado`), `qr_token` + expiración, y
  timestamps por cambio de estado.
- **empleados**: PIN por sucursal.
- **usuarios**: login real — dueño → `organizacion_id`; supervisor → `local_id`.
- **push_subscriptions**: Web Push por pedido/navegador.

### Métricas (derivadas de los timestamps)

- **Tiempo de preparación**: `listo_en − creado_en`.
- **Tiempo de retiro**: `retirado_en − listo_en` (cuánto tarda el cliente en
  retirar después del aviso).
- **Volumen por día/hora**: agregación sobre `creado_en`.
- **Alcance:** el dueño puede ver métricas de la sucursal activa o globales
  (todas las sucursales de la org).

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

## Modelo: organización → sucursales

Cicalino se organiza en tres niveles:

- **Organización (empresa)** — la unidad de cobro. Tiene un dueño (admin) y un
  `cupo` de sucursales contratadas (cobro = cupo × precio por sucursal).
- **Sucursal (local operativo)** — cada punto de venta. Tiene sus propios datos
  (nombre, tipo, dirección), su **modo de identificación** (pedido/nombre/mesa),
  su **cantidad de mesas** y sus **empleados** (con PIN). En el schema es la
  tabla `locales` (con `organizacion_id`).
- **Pedidos y empleados** cuelgan de la **sucursal** (`local_id`). Cada pedido
  guarda además el `empleado_id` de quien lo atendió.

Una empresa con varias sucursales comparte facturación y dueño, pero cada
sucursal opera y mide por separado.

## Roles y permisos

- **Superadmin (Cicalino)** — da de alta organizaciones, define el cupo y
  controla los cobros (pagado/impago, MRR). No carga los datos internos. Puede
  "entrar como dueño" para dar soporte. Área: `/admin`.
- **Admin (dueño de la empresa)** — gestiona su organización: crea sucursales
  (hasta el cupo), configura cada una, carga empleados y ve métricas por
  sucursal o consolidadas. Área: `/panel` + `/panel/config`.
- **Supervisor** — opera **una sucursal**: pedidos, personal y modo. Sin
  métricas globales.
- **Empleado** — perfil con **PIN** dentro de la sucursal (no es un usuario con
  contraseña). Ficha en el dispositivo del mostrador; el pedido registra quién
  atendió. El fichaje es **por dispositivo**, así cada caja/terminal lleva su
  propio turno.

### Configuración (por sucursal)

Nombre, tipo, dirección, modo de identificación, cantidad de mesas y empleados
son **de cada sucursal** — viven en la fila `locales` de esa sucursal y en la
tabla `empleados` (con `local_id`).

> **Nota de prototipo:** el front demo simplifica esto a **una sola sucursal
> activa**: `config-store` y `pedidos-store` son planos (sin `sucursal_id`). Al
> conectar Neon, cada consulta se scopea por `local_id` y la config/empleados
> pasan a leerse de la sucursal activa — el schema ya está modelado así.

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

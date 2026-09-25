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

## Flujo del aviso al personal (capa global)

El panel avisa lo mismo esté abierta la sección que esté: la navegación no
decide si el empleado se entera.

1. **Fuentes** — cada módulo publica su lista de novedades vivas en
   `lib/store/panel-alert-store` (pisa la anterior, no manda eventos sueltos):
   - Mesas → `useFloorAttentionWatch` (llamado al mozo, pedido del comensal,
     pedir la cuenta), derivado de `mesa_sesiones`.
   - Pedidos → `usePanelAlerts` lee los `creado` del mostrador.
   - Recepción → `useWaitlistCancelWatch`, que ya escuchaba `esperas`.
2. **Normalización** — `lib/panelAlerts` las lleva a una forma común
   (`kind`, `source`, `href`, `at`). Sumar un evento es agregar un `kind` y su
   función `...Alerts`, no otro mecanismo de aviso.
3. **Salida** — `PanelAlertDock` (visible en cualquier pantalla, menos sobre la
   que muestra ese detalle), los badges de `PanelNav` y un solo `dingNew`, que
   respeta el silenciador del header.
4. **Visto ≠ resuelto** — el "visto" es por dispositivo. Mesas lo lleva en
   `attention-store` (entrar a la sección / abrir la mesa); el resto, en el
   tablero global. El trabajo sigue pendiente hasta que se procesa.
5. **Transporte** — Realtime primero (`attachLiveRefresh` + `watchChannel`),
   con el poll visible como piso si la suscripción se cae.

## Seguridad (resumen)

- QR: `crypto.randomUUID()`, único, expira a fin de jornada (`qr_expira_en`).
- Cliente: solo datos mínimos; nunca service_role en el browser.
- Rate limit compartido (Upstash obligatorio en Vercel production).
- Privileged helpers (`subscriptionSweep`, billing, contract link) viven en
  `lib/server` con `import "server-only"`, no como Server Actions públicas.
- RPCs admin (`purgar_push_viejas`, cron locks, `cola_de_espera`) solo
  `service_role`.
- Contrato `/aceptar/[token]`: TTL 7 días + rate limit.
- CSP: Report-Only por defecto; `CSP_ENFORCE=1` la activa. Se arma por ruta
  (nonce en las dinámicas, `'unsafe-inline'` en las estáticas) — ver Pendiente.

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

## Modalidades de Pedidos: el mostrador y Mesa, por separado

Dos cosas independientes (`pedidos-modalidades-combinables.sql`):

- `locales.pedidos_modalidad`: cómo funciona el **mostrador**, una sola forma.
  `mostrador` (tradicional: la caja carga el pedido y le pasa el QR, la de
  siempre), `mostrador_qr` (ver la sección siguiente) o `sin_mostrador`.
- `locales.pedidos_mesa`: **Mesa** prendida o apagada. El local no tiene
  mozos: el cliente usa el QR fijo de su mesa y retira en el mostrador.
  Script: `pedidos-mesa-enum.sql` + `pedidos-mesa.sql`.

Combinaciones válidas: tradicional, tradicional + Mesa, QR, QR + Mesa y solo
Mesa. Tradicional + QR no se puede expresar (es una sola columna) y
`sin_mostrador` exige Mesa (constraint `locales_pedidos_alguna_modalidad`).
`crear_pedido` (la carga del empleado) solo anda en modo tradicional; en el
panel, "+ Nuevo pedido" aparece solo ahí. El valor viejo `mesa` se migró a
`sin_mostrador` + `pedidos_mesa = true`.

```
QR de mesa (/m/[token]) → mesa_por_qr devuelve flujo = autoservicio
  → nombre → comensales (misma identidad que Pagos: id + sha256 en cookie)
  → carta (productos) → pedir_autoservicio
       · pedidos.autoservicio, estado `pendiente_pago`, número de la jornada
         (misma serie que crear_pedido, bajo el lock de `locales`)
       · pedido_items + pagos_mesa.pedido_id (el importe sale de los ítems)
  → pago
      ├─ "en caja"      → pedidos.pago_caja_en → bandeja "Por cobrar" de
      │                   /panel/pedidos → cobrar_pedido_autoservicio
      └─ Mercado Pago   → misma preference y mismo /api/mp/webhook
                        → mp_confirmar_pago (rama por pedido)
  → estado `creado` (confirmado_en) → tablero de Pedidos → listo → avisos
  → retirado en el mostrador
```

- **La garantía**: `pendiente_pago → creado` solo pasa si hay `pagos_mesa`
  `pagado` de ese pedido que cubren su total. Lo exige el trigger
  `pedidos_autoservicio_guard`, no la pantalla; `chequear_transicion_pedido`
  además impide saltar a `listo` o `en_preparacion`.
- **Un flujo por mesa**: `mesa_sesiones.flujo` (`cuenta` | `autoservicio`).
  Los triggers `pagos_mesa_flujo_guard` y `mesa_sesiones_flujo_guard` impiden
  que las funciones de la cuenta compartida operen sobre una mesa de
  autoservicio (y al revés). El piso y el historial de Pagos filtran por
  `flujo = 'cuenta'`.
- **Volver a escanear**: el mismo QR sirve para pedir de nuevo y para ver el
  estado. `mesa_autoservicio_estado` devuelve los pedidos del teléfono (por la
  cookie) y, sin cookie, los pedidos vivos de esa mesa con número y estado.
- **Avisos**: `push_subscriptions.comensal_id` ata la suscripción al comensal,
  así un teléfono con dos pedidos se entera de los dos; el push lleva a
  `/m/[token]`.
- **Sin propina ni recargo**: el cliente ve un total y paga ese total.
- **Carta y cobros**: `local_usa_carta` = módulo Pagos **o** Pedidos en
  modalidad Mesa. Es lo que habilita `/panel/menu`, `local_cobros` y la
  conexión de Mercado Pago.
- **Métricas**: un pedido que nunca se pagó no cuenta, y la espera se mide
  desde `confirmado_en`.
- **Cartel**: `/panel/pedidos/qr` usa el mismo generador que Pagos
  (`TableQrManager` + `qrSticker`) con la copia de "Confirmá tu pedido".

## Modalidad de Pedidos: Mostrador QR

`locales.pedidos_modalidad = 'mostrador_qr'`. Para panaderías, cafés y
mostradores: un solo QR para todo el local, el pedido entra a preparación en
el acto y el cliente paga ahora (Mercado Pago) o al retirar (en caja). Script:
`pedidos-mostrador-qr.sql` (después de `pedidos-mesa.sql`). Usa la misma
infraestructura que Mesa, sin mesas.

```
QR del local (/m/[locales.mostrador_qr_token]) → mostrador_qr_por_token
  → carta (sin paso previo)
  → confirmar: unirse_mostrador_qr (si el teléfono no tiene identidad)
               + pedir_mostrador_qr (nombre opcional, forma de pago)
       · mesa_sesiones flujo = mostrador_qr, UNA POR TELÉFONO, sin mesa
       · pedidos.autoservicio, estado `creado` desde el vamos (confirmado_en
         = ahora), número de la jornada (misma serie y mismo lock)
  ├─ Mercado Pago → misma preference y webhook → mp_confirmar_pago lo deja
  │                 pago (no toca el estado de preparación)
  └─ en caja      → pedidos.pago_caja_en; la caja cobra desde la tarjeta del
                    tablero con cobrar_pedido_autoservicio (ChargeModal)
  → tablero (creado → en_preparacion → listo, o creado → listo) → aviso
  → retiro (+ cobro si era en caja)
```

- **Preparación y pago separados**: "está pago" = hay un `pagos_mesa`
  `pagado` de ese pedido. `uq_pagos_mesa_pedido_activo` + los chequeos de
  cobrar/pagar/webhook impiden cobrarlo dos veces; un pago de Mercado Pago que
  llega después de cobrado en caja queda como excedente para devolver.
  `pedidos.pagado_en` lo escribe solo la base al confirmar el cobro, así el
  tablero se entera por realtime.
- **El QR no identifica el pedido**: identifica la entrada. Los pedidos de
  cada teléfono salen de la cookie del comensal (misma identidad que Mesa y
  Pagos, con copia local y `/restaurar`). Regenerar el QR
  (`regenerar_qr_mostrador`) invalida el cartel para pedidos nuevos
  (`pedir_mostrador_qr` exige el token vigente de su local). Los pedidos que
  ya existen no dependen del QR: con la credencial del teléfono, el token
  viejo sigue mostrando los suyos (`qr_vigente = false`, solo seguimiento y
  pago), sin redirigir al cartel nuevo.
- **Cierre de jornada**: la sesión del teléfono se cierra, pero sus pedidos
  abiertos (p. ej. listo sin cobrar) siguen: el cliente los ve y los paga, y
  `pedidos_pagina` los arrastra al tablero hasta que se retiren o cancelen.
- **Sin mesa**: `mesa_sesiones.mesa_id` y `mesa_numero` en null (constraint
  por flujo). Las funciones de la cuenta compartida no operan estas sesiones
  (mismos triggers que autoservicio).
- **Avisos**: el push de listo lleva al link del pedido (`/m/<pedidos.qr_token>`,
  que `mostrador_qr_estado` resuelve a ese pedido aunque el QR del local se
  haya regenerado; no inicia pedidos) y, si no está pago, le
  recuerda que paga al retirar. La pantalla ofrece activar notificaciones
  solo si el navegador puede recibirlas (`webPushAvailable`: capacidad, no
  sistema operativo); si no, pide no cerrar la pestaña.
- **Cartel**: `/panel/pedidos/qr` muestra `CounterQrManager` (mismo
  `InformativeQrCard` + `qrSticker`, copia "Pedí desde tu celular").

## Pagos divididos (módulo `pagos`)

Tercer módulo comercial, al mismo nivel que Pedidos y Espera: `locales.modulo_pagos`
(y el OR en `organizaciones`), con su precio y sus packs en `lib/pricing.ts`. Solo
el superadmin cambia módulos: lo impone el trigger `locales_proteger_modulos`.
Scripts: `split-payments-module.sql` y `split-payments.sql`.

```
QR de mesa (/m/[token], token opaco en mesas.qr_token)
  → nombre → comensales (id real + sha256 del secreto en cookie httpOnly)
  → carta (productos) → pedidos + pedido_items (copia nombre y precio)
  → cuenta → pagos_mesa (monto_base + propina + recargo, por separado)
      ├─ efectivo / débito / crédito / transferencia → pendiente → confirma el personal
      └─ Mercado Pago → checkout con el token OAuth del local
                       → /api/mp/webhook (firma + GET /v1/payments) → pagado
  → cuando los monto_base pagados cubren el consumo → mesa_sesiones.estado = pagada
```

- **Reglas en la base**: los montos se calculan en `_crear_pago_mesa` con la
  sesión bloqueada (`FOR UPDATE`); nunca se compromete más consumo del que hay.
  El cliente manda el monto que vio (`monto_esperado`) y si la cuenta cambió
  recibe `monto-cambio`.
- **Modo de división**: lo fija el primer pago; se puede cambiar mientras no haya
  pagos activos.
- **Propina y recargo**: por pago, sobre la parte del consumo que cubre. No cuentan
  para cubrir la cuenta. El recargo por tarjeta necesita la declaración del dueño
  (`local_cobros.recargo_declarado`, con quién y cuándo).
- **Mercado Pago**: nunca se marca pagado por volver del checkout ni a mano;
  solo `mp_confirmar_pago` (service_role) después de validar firma, frescura
  del `ts`, sucursal, monto y moneda. Un pago que no puede cubrirse
  (excedente, monto distinto, sesión ya cobrada o cancelada) no suma al
  consumo pagado: queda `mp_estado` identificable para conciliar. Un aviso
  duplicado se registra en `mesa_eventos` y no aplica otra vez.
- **Acceso**: el comensal nunca habla con PostgREST. `/api/m/*` usa service_role,
  rate limit y chequeo de origen, y las funciones validan id + hash. El panel lee
  por RLS y escribe por RPC. El alias de transferencia y la cuenta de MP los
  cambia solo el dueño. `mp_cuentas` no tiene grants para clientes.
- **Auditoría**: `mesa_eventos`, solo lo escriben las funciones.
- **Pedidos de mesa**: son filas de `pedidos` con `sesion_id`. No aparecen en el
  tablero de mostrador (`pedidos_pagina`), se operan desde `/panel/mesas`, y
  cuentan en las métricas.
- **Mesas**: se reutiliza `mesas`. Abrir una cuenta no cambia `mesas.estado` (el
  mapa de Espera); `sincronizar_mesas` no borra mesas con una cuenta abierta.
- **Jornada**: una cuenta abierta de una jornada anterior se cierra sola cuando
  alguien vuelve a escanear esa mesa.
- **POS externos**: fuera de alcance. Los pedidos, las mesas y los pagos tienen
  ids propios y estados explícitos, así que una integración futura puede
  mapearlos sin tocar el flujo del comensal.
- **Stickers**: el PNG de `/panel/pagos/qr` es lo que se manda a imprimir. La
  impresión física queda afuera de Cicalino.
- **Modalidad Mesa**: si Pedidos tiene Mesa activada (`pedidos_mesa`), el QR de las mesas
  abre ese flujo y no la cuenta compartida (ver arriba).

## Tests contra la base (`pnpm test:db`)

Requiere `DATABASE_URL` en `.env.local`. Dos archivos:

- `security-grants.test.ts` — grants, RLS activo, policies y privilegios de
  columna. Solo lectura del catálogo.
- `split-payments.test.ts` — montos, sobrepago, propina, recargo, webhook de
  Mercado Pago y permisos de pagos divididos. Misma técnica (rollback).
- `pedidos-mesa.test.ts` — Pedidos en modalidad Mesa: que un pedido sin cobro
  no entre a preparación por ningún camino, que la caja y el webhook sean los
  únicos que lo confirman, y que las funciones de la cuenta compartida no
  puedan operar esa mesa.
- `rls-aislamiento.test.ts` — que la empresa A no vea nada de la B, que un
  supervisor no salga de su sucursal, que nadie se auto-ascienda de rol y que
  una cuenta cortada pueda leer pero no escribir. **Cada test corre dentro de
  una transacción que termina en `rollback`**, así que crea sus dos empresas de
  prueba, comprueba y no deja una sola fila. Por eso puede correr contra la
  base real sin un proyecto aparte.

Los usuarios se simulan como lo hace PostgREST: `request.jwt.claims` con el
`sub` + `set local role authenticated`. Con eso `auth.uid()`, `auth_rol()` y
las policies se comportan igual que en producción.

## Pendiente

- Migraciones deterministas: `supabase/orden.json` + `pnpm db:sql` /
  `pnpm db:sql:baseline` (tabla `cicalino_schema_migrations`). Queda formalizar
  el flujo tipo Supabase CLI a largo plazo.
- Faltan tests de integración de la API del QR y del cron end-to-end.
  (Aislamiento entre empresas y grants: ya cubiertos, ver abajo.)
- `CSP_ENFORCE=1` ya se puede activar: la CSP se arma distinta según la ruta
  (`lib/security/csp.ts`). Las dinámicas (`/p`, `/e`, `/m`, `/aceptar`, `/admin`)
  llevan nonce y protegen contra scripts inyectados; las estáticas (`/`,
  `/login`, `/pricing`, `/faq`, `/probar`, `/terms`, `/panel/*`) se generan en
  el build —cuando todavía no hay request ni nonce— así que van con
  `'unsafe-inline'`. El resto de las directivas (`frame-ancestors`,
  `object-src`, `base-uri`, `form-action`, `connect-src`) aplica en todas.
  Ojo: nonce y `'unsafe-inline'` no conviven — el navegador ignora el segundo
  cuando hay nonce. Si una ruta cambia de ○ a ƒ en `next build`, hay que
  actualizar `RUTAS_CON_NONCE`.

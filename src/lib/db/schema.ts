import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  integer,
  boolean,
  date,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const businessTypeEnum = pgEnum("business_type", [
  "cafeteria",
  "panaderia",
  "rotiseria",
  "heladeria",
  "bar",
  "restaurante",
  "pasteleria",
  "food_truck",
  "otro",
]);

/* supabase/pedidos-mesa-enum.sql adds "pendiente_pago": a table order in
 * Pedidos' Mesa mode that isn't paid yet. It never reaches the kitchen. */
export const orderStatusEnum = pgEnum("order_status", [
  "pendiente_pago",
  "creado",
  "en_preparacion",
  "listo",
  "retirado",
  "cancelado",
]);

export const identificationModeEnum = pgEnum("modo_identificacion", [
  "pedido",
  "nombre",
  "mesa",
]);

/* supabase/staff-role-enum.sql adds "empleado" (waiter): runs the floor,
 * no branch setup. */
export const userRoleEnum = pgEnum("rol_usuario", [
  "superadmin",
  "admin",
  "supervisor",
  "empleado",
]);

export const subscriptionStatusEnum = pgEnum("estado_suscripcion", [
  "trial",
  "active",
  "pending_payment",
  "expired",
  "paused",
]);

export const organizations = pgTable("organizaciones", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  responsable: text("responsable"),
  telefono: text("telefono"),
  cuil: text("cuil"),
  direccion: text("direccion"),
  ownerEmail: text("dueno_email").notNull(),
  cupo: integer("cupo").notNull().default(1),
  /* Informational. The subscription state lives in subscriptionStatus;
   * nothing branches on this one. */
  pagado: boolean("pagado").notNull().default(true),
  activo: boolean("activo").notNull().default(true),
  plan: text("plan").notNull().default("mensual"),
  freeMonthUntil: timestamp("mes_gratis_hasta", { withTimezone: true }),
  /* DEPRECATED — superseded by nextInvoice (proxima_factura). Nothing reads or
   * writes it any more; see supabase/un-solo-modelo-cobro.sql for the drop. */
  nextChargeAt: timestamp("proximo_cobro_en", { withTimezone: true }),
  /* Last time the CUSTOMER was emailed about an overdue payment.
   * Only subscriptionCron writes this. */
  billingReminderAt: timestamp("aviso_cobro_en", { withTimezone: true }),
  /* Last time the OPERATOR was emailed about this account. Internal only:
   * they used to share one column and the internal one silently suppressed
   * the customer notice. */
  internalReminderAt: timestamp("aviso_interno_en", { withTimezone: true }),
  moduloPedidos: boolean("modulo_pedidos").notNull().default(true),
  moduloEspera: boolean("modulo_espera").notNull().default(false),
  moduloPagos: boolean("modulo_pagos").notNull().default(false),
  contractToken: text("contrato_token"),
  contractTokenCreatedAt: timestamp("contrato_token_creado_en", {
    withTimezone: true,
  }),
  contractAcceptedAt: timestamp("contrato_aceptado_en", { withTimezone: true }),
  termsVersion: text("terminos_version"),

  /* Subscription model, added by supabase/suscripciones.sql. Coexists with the
   * older pagado/activo/proximo_cobro_en trio above: this one drives the cron
   * and the cut-off, that one drives the Superadmin billing panel. Merging them
   * is still pending. */
  subscriptionStatus: subscriptionStatusEnum("estado_suscripcion").default(
    "trial",
  ),
  trialStart: date("prueba_inicio"),
  trialEnd: date("prueba_fin"),
  nextInvoice: date("proxima_factura"),
  cycleDay: integer("dia_ciclo"),
  lastPaymentAt: date("ultimo_pago_en"),
  suspendedAt: timestamp("suspendida_en", { withTimezone: true }),
  welcomeAt: timestamp("bienvenida_en", { withTimezone: true }),
  trial5dNoticeAt: timestamp("aviso_prueba_5d_en", { withTimezone: true }),
  trialEndNoticeAt: timestamp("aviso_prueba_fin_en", { withTimezone: true }),

  createdAt: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const branches = pgTable("locales", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organizacion_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  tipoNegocio: businessTypeEnum("tipo_negocio").notNull().default("otro"),
  whatsapp: text("whatsapp"),
  direccion: text("direccion"),
  slug: text("slug").notNull(),
  identificationMode: identificationModeEnum("modo_identificacion")
    .notNull()
    .default("pedido"),
  tableCount: integer("cantidad_mesas"),
  cutoffHour: integer("hora_corte").notNull().default(6),
  /* Reservation picker window (minutes from midnight) + closed weekdays. */
  reservaAbreMin: integer("reserva_abre_min").notNull().default(660),
  reservaCierraMin: integer("reserva_cierra_min").notNull().default(1380),
  diasCerrados: integer("dias_cerrados").array().notNull().default([]),
  moduloPedidos: boolean("modulo_pedidos").notNull().default(true),
  moduloEspera: boolean("modulo_espera").notNull().default(false),
  /* supabase/split-payments-module.sql. Superadmin only (trigger). */
  moduloPagos: boolean("modulo_pagos").notNull().default(false),
  /* supabase/pedidos-modalidades-combinables.sql. How the counter works:
   * "mostrador" (traditional, the counter creates the order), "mostrador_qr"
   * (one QR for the branch; the guest places the order) or "sin_mostrador"
   * (Mesa only). */
  pedidosModalidad: text("pedidos_modalidad").notNull().default("mostrador"),
  /* Mesa (the guest orders and pays from the table QR), independent of the
   * counter. */
  pedidosMesa: boolean("pedidos_mesa").notNull().default(false),
  /* supabase/pedidos-mostrador-qr.sql — the branch's counter QR. Opaque,
   * regenerable only through regenerar_qr_mostrador. */
  mostradorQrToken: text("mostrador_qr_token").notNull(),
  mostradorQrGeneradoEn: timestamp("mostrador_qr_generado_en", { withTimezone: true }),
  /* Guest identity only. null = Cicalino cobalt, no logo. */
  logoUrl: text("logo_url"),
  colorMarca: text("color_marca"),
  activa: boolean("activa").notNull().default(true),
  bajaEn: timestamp("baja_en", { withTimezone: true }),
  /* When this branch starts being billed. Null means from day one. */
  cobroDesde: date("cobro_desde"),
  responsableId: uuid("responsable_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const employees = pgTable(
  "empleados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    rol: text("rol"),
    pinHash: text("pin_hash"),
    /* Generated column (pin_hash is not null). The client can read this one;
     * pin_hash itself is revoked from anon/authenticated. */
    tienePin: boolean("tiene_pin"),
    usuarioId: uuid("usuario_id"),
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_empleados_local").on(t.localId),
    uniqueIndex("uq_empleados_local_nombre").on(
      t.localId,
      sql`lower(trim(${t.nombre}))`,
    ),
  ],
);

export const users = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    nombre: text("nombre"),
    rol: userRoleEnum("rol").notNull().default("admin"),
    organizationId: uuid("organizacion_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    localId: uuid("local_id").references(() => branches.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uq_usuarios_email").on(t.email)],
);

export const orders = pgTable(
  "pedidos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),

    referencia: text("referencia").notNull(),
    /* Apodo opcional que carga el cliente en /p/{token}. */
    aliasCliente: text("alias_cliente"),

    estado: orderStatusEnum("estado").notNull().default("creado"),

    employeeId: uuid("empleado_id").references(() => employees.id, {
      onDelete: "set null",
    }),

    qrToken: text("qr_token").notNull(),
    qrExpiresAt: timestamp("qr_expira_en", { withTimezone: true }).notNull(),

    createdAt: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    preparingAt: timestamp("en_preparacion_en", { withTimezone: true }),
    readyAt: timestamp("listo_en", { withTimezone: true }),
    pickedUpAt: timestamp("retirado_en", { withTimezone: true }),
    cancelledAt: timestamp("cancelado_en", { withTimezone: true }),
    seenAt: timestamp("visto_en", { withTimezone: true }),
    notifiedAt: timestamp("avisado_en", { withTimezone: true }),
    /* supabase/split-payments.sql — set only for orders placed from a table
     * QR. Kept out of pedidos_pagina (the counter board). */
    /* supabase/staff-roles.sql — account that created it (auth.uid()). */
    createdBy: uuid("creado_por"),
    tableSessionId: uuid("sesion_id"),
    guestId: uuid("comensal_id"),
    idempotencyKey: uuid("clave_idempotencia"),
    /* supabase/pedidos-mesa.sql — placed from the table QR in Pedidos' Mesa
     * mode. Starts in pendiente_pago; confirmedAt is when it got paid. */
    selfService: boolean("autoservicio").notNull().default(false),
    confirmedAt: timestamp("confirmado_en", { withTimezone: true }),
    payAtCounterAt: timestamp("pago_caja_en", { withTimezone: true }),
    /* supabase/pedidos-mostrador-qr.sql — when the payment was confirmed
     * (counter QR orders). Written only by the database. */
    paidAt: timestamp("pagado_en", { withTimezone: true }),
  },
  (t) => [
    index("idx_pedidos_local_estado").on(t.localId, t.estado),
    uniqueIndex("uq_pedidos_qr_token").on(t.qrToken),
    index("idx_pedidos_local_creado").on(t.localId, t.createdAt),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pedidoId: uuid("pedido_id").references(() => orders.id, {
      onDelete: "cascade",
    }),
    waitlistId: uuid("espera_id").references(() => waitlistEntries.id, {
      onDelete: "cascade",
    }),
    /* supabase/pedidos-mesa.sql — a table guest: every order of theirs. */
    guestId: uuid("comensal_id"),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_push_pedido").on(t.pedidoId),
    // Un endpoint es un navegador, y espera un pedido a la vez.
    uniqueIndex("uq_push_endpoint").on(t.endpoint),
    index("idx_push_espera").on(t.waitlistId),
  ],
);

export const leads = pgTable("solicitudes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("nombre").notNull(),
  email: text("email").notNull(),
  telefono: text("telefono"),
  local: text("local"),
  ciudad: text("ciudad"),
  direccion: text("direccion"),
  cuil: text("cuil"),
  status: text("estado").notNull().default("nueva"),
  tipo: text("tipo").notNull().default("prueba"),
  plan: text("plan"),
  pack: text("pack"),
  createdAt: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Lead = typeof leads.$inferSelect;

export const branchRequests = pgTable("pedidos_sucursal", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organizacion_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  cupoActual: integer("cupo_actual").notNull(),
  cupoPedido: integer("cupo_pedido").notNull(),
  nombreSucursal: text("nombre_sucursal"),
  estado: text("estado").notNull().default("nueva"),
  createdAt: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type BranchRequest = typeof branchRequests.$inferSelect;

export const waitlistStatusEnum = pgEnum("espera_estado", [
  "esperando",
  "avisado",
  "sentado",
  "cancelado",
]);

export const waitlistEntries = pgTable(
  "esperas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    personas: integer("personas").notNull().default(2),
    estado: waitlistStatusEnum("estado").notNull().default("esperando"),
    tableNumber: integer("mesa_numero"),
    qrToken: text("qr_token").notNull(),
    qrExpiresAt: timestamp("qr_expira_en", { withTimezone: true }).notNull(),
    employeeId: uuid("empleado_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notifiedAt: timestamp("avisado_en", { withTimezone: true }),
    seatedAt: timestamp("sentado_en", { withTimezone: true }),
    cancelledAt: timestamp("cancelado_en", { withTimezone: true }),
    seenAt: timestamp("visto_en", { withTimezone: true }),
    createdBy: uuid("creado_por"),
  },
  (t) => [
    index("idx_esperas_local_estado").on(t.localId, t.estado),
    uniqueIndex("uq_esperas_qr_token").on(t.qrToken),
    index("idx_esperas_local_creado").on(t.localId, t.createdAt),
  ],
);

export const reservationStatusEnum = pgEnum("reserva_estado", [
  "activa",
  "sentada",
  "cancelada",
  "expirada",
]);

export const reservations = pgTable(
  "reservas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    personas: integer("personas").notNull().default(2),
    tableNumber: integer("mesa_numero").notNull(),
    tableNumbers: integer("mesas_numeros").array().notNull().default([]),
    horario: timestamp("horario", { withTimezone: true }).notNull(),
    graceMinutes: integer("gracia_minutos").notNull().default(15),
    estado: reservationStatusEnum("estado").notNull().default("activa"),
    employeeId: uuid("empleado_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    seatedAt: timestamp("sentado_en", { withTimezone: true }),
    cancelledAt: timestamp("cancelado_en", { withTimezone: true }),
    expiredAt: timestamp("expirado_en", { withTimezone: true }),
    createdBy: uuid("creado_por"),
  },
  (t) => [
    index("idx_reservas_local_horario").on(t.localId, t.horario),
    index("idx_reservas_local_estado").on(t.localId, t.estado),
  ],
);

export const tables = pgTable(
  "mesas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    estado: text("estado").notNull().default("libre"),
    capacidad: integer("capacidad").notNull().default(4),
    waitlistId: uuid("espera_id").references(() => waitlistEntries.id, {
      onDelete: "set null",
    }),
    reservationId: uuid("reserva_id").references(() => reservations.id, {
      onDelete: "set null",
    }),
    /* supabase/split-payments.sql — opaque token printed on the table QR. */
    qrToken: text("qr_token").notNull(),
    qrGeneratedAt: timestamp("qr_generado_en", { withTimezone: true }),
    qrActive: boolean("qr_activo").notNull().default(false),
    updatedAt: timestamp("actualizado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_mesas_local").on(t.localId),
    uniqueIndex("uq_mesas_local_numero").on(t.localId, t.numero),
  ],
);


/* ---------------------------------------------------------------------------
 * Tables that only existed in supabase/*.sql until now. The app reads all
 * three, so leaving them out meant the schema didn't describe the database.
 * ------------------------------------------------------------------------ */

/* supabase/suscripciones.sql — payment history, written by savePayment. */
export const payments = pgTable(
  "pagos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organizacion_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fecha: date("fecha").notNull(),
    monto: integer("monto").notNull(),
    periodoDesde: date("periodo_desde").notNull(),
    periodoHasta: date("periodo_hasta").notNull(),
    medio: text("medio"),
    nota: text("nota"),
    detalle: jsonb("detalle").default([]),
    createdAt: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_pagos_org_fecha").on(t.organizationId, t.fecha)],
);

/* supabase/emails-enviados.sql — delivery log. `aceptado` means Resend took
 * it, not that it reached an inbox. */
export const sentEmails = pgTable(
  "emails_enviados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organizacion_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    destinatario: text("destinatario").notNull(),
    tipo: text("tipo").notNull(),
    asunto: text("asunto").notNull(),
    aceptado: boolean("aceptado").notNull().default(false),
    error: text("error"),
    proveedorId: text("proveedor_id"),
    createdAt: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_emails_org_fecha").on(t.organizationId, t.createdAt)],
);

/* supabase/usuarios-sucursales.sql — which branches a supervisor can open.
 * `auth_locales()` reads this, so it decides what RLS lets them see. */
export const userBranches = pgTable(
  "usuario_sucursal",
  {
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    localId: uuid("local_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    createdAt: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.usuarioId, t.localId] }),
    index("idx_usuario_sucursal_local").on(t.localId),
  ],
);

/* supabase/cron-lock.sql — stops two cron runs overlapping. */
export const cronLocks = pgTable("cron_locks", {
  nombre: text("nombre").primaryKey(),
  tomadoEn: timestamp("tomado_en", { withTimezone: true }).notNull().defaultNow(),
  expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type SentEmail = typeof sentEmails.$inferSelect;
export type UserBranch = typeof userBranches.$inferSelect;


/* supabase/reservas-sin-solape.sql — una fila por mesa de cada reserva activa,
 * con la ventana que esa reserva bloquea.
 *
 * Es derivada: un trigger la mantiene al día desde `reservas`, que sigue
 * siendo la tabla que se lee y se escribe. Existe porque un exclusion
 * constraint necesita una fila por (mesa, ventana) para comparar, y no puede
 * mirar adentro del array `mesas_numeros`. */
export const reservationTables = pgTable(
  "reserva_mesas",
  {
    reservaId: uuid("reserva_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    localId: uuid("local_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    /* tstzrange. Drizzle no lo modela, así que va como texto: nadie lo lee
     * desde la app, lo usa el constraint. */
    ventana: text("ventana").notNull(),
  },
  (t) => [primaryKey({ columns: [t.reservaId, t.numero] })],
);

/* ---------------------------------------------------------------------------
 * Split payments (supabase/split-payments.sql). Every write to sessions,
 * guests, items and payments goes through SECURITY DEFINER functions; the
 * panel only reads these tables.
 * ------------------------------------------------------------------------ */

export const tableSessionStatusEnum = pgEnum("mesa_sesion_estado", [
  "abierta",
  "pagada",
  "cerrada",
]);

export const splitModeEnum = pgEnum("division_modo", [
  "consumo",
  "iguales",
  "uno",
  "monto",
  "porcentaje",
]);

export const tablePaymentMethodEnum = pgEnum("metodo_pago_mesa", [
  "mercado_pago",
  "transferencia",
  "efectivo",
  "qr_mercado_pago",
  "tarjeta_debito",
  "tarjeta_credito",
]);

export const tablePaymentStatusEnum = pgEnum("pago_mesa_estado", [
  "definido",
  "pendiente",
  "pagado",
  "cancelado",
]);

export const menuCategories = pgTable("categorias", {
  id: uuid("id").primaryKey().defaultRandom(),
  localId: uuid("local_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  activa: boolean("activa").notNull().default(true),
  orden: integer("orden").notNull().default(0),
  createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const menuItems = pgTable("productos", {
  id: uuid("id").primaryKey().defaultRandom(),
  localId: uuid("local_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  categoria: text("categoria"),
  precio: integer("precio").notNull(),
  costo: integer("costo"),
  imagenUrl: text("imagen_url"),
  activo: boolean("activo").notNull().default(true),
  orden: integer("orden").notNull().default(0),
  createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const branchPaymentSettings = pgTable("local_cobros", {
  localId: uuid("local_id").primaryKey().references(() => branches.id, { onDelete: "cascade" }),
  aceptaMercadoPago: boolean("acepta_mercado_pago").notNull().default(false),
  aceptaTransferencia: boolean("acepta_transferencia").notNull().default(false),
  aceptaEfectivo: boolean("acepta_efectivo").notNull().default(true),
  aceptaQrMercadoPago: boolean("acepta_qr_mercado_pago").notNull().default(false),
  aceptaDebito: boolean("acepta_debito").notNull().default(true),
  aceptaCredito: boolean("acepta_credito").notNull().default(true),
  transferenciaAlias: text("transferencia_alias"),
  transferenciaTitular: text("transferencia_titular"),
  transferenciaCbu: text("transferencia_cbu"),
  /* numeric(4,2); Drizzle's numeric maps to string. */
  recargoDebitoPct: text("recargo_debito_pct").notNull(),
  recargoCreditoPct: text("recargo_credito_pct").notNull(),
  recargoDeclarado: boolean("recargo_declarado").notNull().default(false),
  recargoDeclaradoEn: timestamp("recargo_declarado_en", { withTimezone: true }),
  recargoDeclaradoPor: uuid("recargo_declarado_por"),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

/* Server only: no grants for anon/authenticated. Tokens are AES-GCM
 * encrypted by lib/server/mercadopago. */
export const mercadoPagoAccounts = pgTable("mp_cuentas", {
  localId: uuid("local_id").primaryKey().references(() => branches.id, { onDelete: "cascade" }),
  mpUserId: text("mp_user_id").notNull(),
  accessTokenCifrado: text("access_token_cifrado").notNull(),
  refreshTokenCifrado: text("refresh_token_cifrado").notNull(),
  expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),
  liveMode: boolean("live_mode"),
  conectadoEn: timestamp("conectado_en", { withTimezone: true }).notNull().defaultNow(),
  conectadoPor: uuid("conectado_por"),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const mercadoPagoOauthStates = pgTable("mp_oauth_estados", {
  stateHash: text("state_hash").primaryKey(),
  localId: uuid("local_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
  usuarioId: uuid("usuario_id").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),
});

export const tableSessions = pgTable(
  "mesa_sesiones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    mesaId: uuid("mesa_id").references(() => tables.id, { onDelete: "set null" }),
    /* null only for a counter QR session (flujo = mostrador_qr): no table. */
    mesaNumero: integer("mesa_numero"),
    estado: tableSessionStatusEnum("estado").notNull().default("abierta"),
    modoDivision: splitModeEnum("modo_division"),
    partes: integer("partes"),
    version: integer("version").notNull().default(1),
    abiertaEn: timestamp("abierta_en", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
    pagadaEn: timestamp("pagada_en", { withTimezone: true }),
    cerradaEn: timestamp("cerrada_en", { withTimezone: true }),
    cerradaMotivo: text("cerrada_motivo"),
    cuentaIntencion: text("cuenta_intencion"),
    cuentaSolicitadaEn: timestamp("cuenta_solicitada_en", { withTimezone: true }),
    cuentaSolicitadaPor: uuid("cuenta_solicitada_por"),
    cuentaPagadorTotalId: uuid("cuenta_pagador_total_id"),
    cuentaPagadorTotalNombre: text("cuenta_pagador_total_nombre"),
    /* supabase/pedidos-mesa.sql — "cuenta" (Pagos), "autoservicio" (Mesa) or
     * "mostrador_qr" (pedidos-mostrador-qr.sql, one session per phone). */
    flujo: text("flujo").notNull().default("cuenta"),
  },
  (t) => [
    uniqueIndex("uq_mesa_sesion_abierta").on(t.mesaId).where(sql`estado = 'abierta'`),
    index("idx_mesa_sesiones_local").on(t.localId, t.estado, t.updatedAt),
  ],
);

export const guests = pgTable(
  "comensales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sesionId: uuid("sesion_id").notNull().references(() => tableSessions.id, { onDelete: "cascade" }),
    localId: uuid("local_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    /* Optional only at the counter QR (pedidos-mostrador-qr.sql). */
    nombre: text("nombre"),
    /* sha256 of the browser secret. Not granted to authenticated. */
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
    seenAt: timestamp("visto_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_comensales_token").on(t.tokenHash),
    index("idx_comensales_sesion").on(t.sesionId),
  ],
);

export const orderItems = pgTable(
  "pedido_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pedidoId: uuid("pedido_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    localId: uuid("local_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    sesionId: uuid("sesion_id").notNull().references(() => tableSessions.id, { onDelete: "cascade" }),
    comensalId: uuid("comensal_id").notNull().references(() => guests.id, { onDelete: "cascade" }),
    productoId: uuid("producto_id").references(() => menuItems.id, { onDelete: "set null" }),
    /* Name and price copied when ordering. */
    nombre: text("nombre").notNull(),
    precioUnitario: integer("precio_unitario").notNull(),
    cantidad: integer("cantidad").notNull(),
    subtotal: integer("subtotal").generatedAlwaysAs(sql`precio_unitario * cantidad`),
    createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_pedido_items_sesion").on(t.sesionId),
    index("idx_pedido_items_pedido").on(t.pedidoId),
  ],
);

export const tablePayments = pgTable(
  "pagos_mesa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    sesionId: uuid("sesion_id").notNull().references(() => tableSessions.id, { onDelete: "cascade" }),
    comensalId: uuid("comensal_id").references(() => guests.id, { onDelete: "set null" }),
    pagadorNombre: text("pagador_nombre").notNull(),
    modo: splitModeEnum("modo").notNull(),
    partes: integer("partes").notNull().default(1),
    /* Consumption this payment covers. Tip and surcharge are separate and
     * never count towards covering the bill. */
    montoBase: integer("monto_base").notNull(),
    propina: integer("propina").notNull().default(0),
    propinaPorcentaje: integer("propina_porcentaje"),
    recargo: integer("recargo").notNull().default(0),
    recargoPorcentaje: text("recargo_porcentaje").notNull(),
    montoTotal: integer("monto_total").generatedAlwaysAs(sql`monto_base + propina + recargo`),
    metodo: tablePaymentMethodEnum("metodo").notNull(),
    estado: tablePaymentStatusEnum("estado").notNull().default("pendiente"),
    creadoPor: text("creado_por").notNull(),
    claveIdempotencia: uuid("clave_idempotencia"),
    createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
    confirmacion: text("confirmacion"),
    confirmadoEn: timestamp("confirmado_en", { withTimezone: true }),
    confirmadoPor: uuid("confirmado_por"),
    confirmadoEmpleado: uuid("confirmado_empleado").references(() => employees.id, { onDelete: "set null" }),
    canceladoEn: timestamp("cancelado_en", { withTimezone: true }),
    canceladoMotivo: text("cancelado_motivo"),
    expiraEn: timestamp("expira_en", { withTimezone: true }),
    mpPreferenciaId: text("mp_preferencia_id"),
    mpPagoId: text("mp_pago_id"),
    mpEstado: text("mp_estado"),
    /* supabase/pedidos-mesa.sql — the order this payment is for (Mesa mode). */
    pedidoId: uuid("pedido_id").references(() => orders.id, { onDelete: "set null" }),
  },
  (t) => [
    index("idx_pagos_mesa_sesion").on(t.sesionId, t.estado),
    uniqueIndex("uq_pagos_mesa_clave").on(t.sesionId, t.claveIdempotencia).where(sql`clave_idempotencia is not null`),
    uniqueIndex("uq_pagos_mesa_mp_pago").on(t.mpPagoId).where(sql`mp_pago_id is not null`),
  ],
);

export const tableEvents = pgTable(
  "mesa_eventos",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    localId: uuid("local_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    sesionId: uuid("sesion_id").references(() => tableSessions.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    actor: text("actor").notNull(),
    comensalId: uuid("comensal_id"),
    usuarioId: uuid("usuario_id"),
    empleadoId: uuid("empleado_id"),
    pedidoId: uuid("pedido_id"),
    pagoId: uuid("pago_id"),
    datos: jsonb("datos").notNull().default({}),
    createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_mesa_eventos_sesion").on(t.sesionId, t.createdAt),
    index("idx_mesa_eventos_local").on(t.localId, t.createdAt),
  ],
);

export type MenuItem = typeof menuItems.$inferSelect;
export type TableSession = typeof tableSessions.$inferSelect;
export type Guest = typeof guests.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type TablePayment = typeof tablePayments.$inferSelect;

export const organizationsRelations = relations(organizations, ({ many }) => ({
  branches: many(branches),
  appUsers: many(users),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  organizacion: one(organizations, {
    fields: [branches.organizationId],
    references: [organizations.id],
  }),
  pedidos: many(orders),
  empleados: many(employees),
}));

export const employeesRelations = relations(employees, ({ one }) => ({
  local: one(branches, {
    fields: [employees.localId],
    references: [branches.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  local: one(branches, {
    fields: [orders.localId],
    references: [branches.id],
  }),
  empleado: one(employees, {
    fields: [orders.employeeId],
    references: [employees.id],
  }),
  pushSubscriptions: many(pushSubscriptions),
}));

export const usersRelations = relations(users, ({ one }) => ({
  organizacion: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  local: one(branches, {
    fields: [users.localId],
    references: [branches.id],
  }),
}));

export const pushSubscriptionsRelations = relations(
  pushSubscriptions,
  ({ one }) => ({
    pedido: one(orders, {
      fields: [pushSubscriptions.pedidoId],
      references: [orders.id],
    }),
  }),
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type AppUser = typeof users.$inferSelect;
export type NewAppUser = typeof users.$inferInsert;
export type IdentificationMode = (typeof identificationModeEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];

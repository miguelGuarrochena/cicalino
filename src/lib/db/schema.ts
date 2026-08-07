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

export const orderStatusEnum = pgEnum("order_status", [
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

export const userRoleEnum = pgEnum("rol_usuario", [
  "superadmin",
  "admin",
  "supervisor",
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
  pagado: boolean("pagado").notNull().default(true),
  activo: boolean("activo").notNull().default(true),
  plan: text("plan").notNull().default("mensual"),
  freeMonthUntil: timestamp("mes_gratis_hasta", { withTimezone: true }),
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
  contractToken: text("contrato_token"),
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
  moduloPedidos: boolean("modulo_pedidos").notNull().default(true),
  moduloEspera: boolean("modulo_espera").notNull().default(false),
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

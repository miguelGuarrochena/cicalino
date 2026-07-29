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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

// Tipo de negocio del local (para metricas / segmentacion futura).
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

// Estados del pedido. Flujo operativo (mostrador/caja):
//   creado (en curso) -> listo -> retirado
//   (desde en curso o listo también se puede cancelar)
// `en_preparacion` queda en el enum por compatibilidad; la UI ya no lo usa.
export const orderStatusEnum = pgEnum("order_status", [
  "creado",
  "en_preparacion",
  "listo",
  "retirado",
  "cancelado",
]);

// Como identifica el local a cada pedido:
//  - pedido: numero de turno correlativo (take away)
//  - nombre: nombre del cliente (take away)
//  - mesa:   numero de mesa (para organizar al personal)
export const identificationModeEnum = pgEnum("modo_identificacion", [
  "pedido",
  "nombre",
  "mesa",
]);

// Roles de cuenta con login real (email + contraseña):
//  - superadmin: Cicalino. Alta de organizaciones, cupo y cobros.
//  - admin: dueño de la EMPRESA (organización). Ve sucursales y métricas globales.
//  - supervisor: una SUCURSAL. Pedidos, personal y modo. Sin métricas globales.
// Los empleados NO son usuarios: son perfiles con PIN dentro de la sucursal.
export const userRoleEnum = pgEnum("rol_usuario", [
  "superadmin",
  "admin",
  "supervisor",
]);

// ---------------------------------------------------------------------------
// Organizaciones (empresas / unidad de cobro)
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizaciones", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  responsable: text("responsable"),
  // Teléfono de contacto del dueño / empresa (WhatsApp preferido).
  telefono: text("telefono"),
  cuil: text("cuil"),
  direccion: text("direccion"),
  duenoEmail: text("dueno_email").notNull(),
  // Sucursales contratadas (cobro = cupo × PRECIO_POR_SUCURSAL).
  cupo: integer("cupo").notNull().default(1),
  pagado: boolean("pagado").notNull().default(true),
  activo: boolean("activo").notNull().default(true),
  // Facturación manual (sin pasarela): ciclo de cobro y cortesía.
  //   plan: "mensual" | "anual" | "gratis"
  plan: text("plan").notNull().default("mensual"),
  // Si está en el futuro, no se cobra (mes gratis / prueba).
  mesGratisHasta: timestamp("mes_gratis_hasta", { withTimezone: true }),
  // Próximo cobro esperado (manual). Se actualiza al marcar Pagado / mes gratis.
  proximoCobroEn: timestamp("proximo_cobro_en", { withTimezone: true }),
  // Último mail de recordatorio de cobro (anti-spam).
  avisoCobroEn: timestamp("aviso_cobro_en", { withTimezone: true }),
  // Módulos contratados (cobro = cupo × precio según pack).
  moduloPedidos: boolean("modulo_pedidos").notNull().default(true),
  moduloEspera: boolean("modulo_espera").notNull().default(false),
  // Aceptación de bases y condiciones (link /aceptar/[token]).
  contratoToken: text("contrato_token"),
  contratoAceptadoEn: timestamp("contrato_aceptado_en", { withTimezone: true }),
  terminosVersion: text("terminos_version"),
  creadoEn: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Sucursales (locales operativos — antes "tenants" planos)
// ---------------------------------------------------------------------------

export const locales = pgTable("locales", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizacionId: uuid("organizacion_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  tipoNegocio: businessTypeEnum("tipo_negocio").notNull().default("otro"),
  whatsapp: text("whatsapp"),
  direccion: text("direccion"),
  // slug corto para URLs amigables del local (ej: cicalino.net/l/mi-cafe)
  slug: text("slug").notNull(),
  // Como se identifica cada pedido (lo elige el local en la config).
  modoIdentificacion: identificationModeEnum("modo_identificacion")
    .notNull()
    .default("pedido"),
  // Cantidad de mesas (modo identificación "mesa" Y/O módulo espera).
  cantidadMesas: integer("cantidad_mesas"),
  // Hora a la que corta la jornada operativa (0-23). Default 6:00.
  horaCorte: integer("hora_corte").notNull().default(6),
  // Módulos activos en esta sucursal (subset de lo contratado en la org).
  moduloPedidos: boolean("modulo_pedidos").notNull().default(true),
  moduloEspera: boolean("modulo_espera").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Empleados (personal del local, para atender pedidos y metricas por persona)
// ---------------------------------------------------------------------------

export const employees = pgTable(
  "empleados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    rol: text("rol"),
    // Hash bcrypt del PIN (solo vía RPC `set_empleado_pin`). Nunca al cliente.
    // La columna generada `tiene_pin` vive en la DB (security-fixes-03.sql).
    pinHash: text("pin_hash"),
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_empleados_local").on(t.localId)],
);

// ---------------------------------------------------------------------------
// Usuarios con login real (superadmin / admin del local)
// ---------------------------------------------------------------------------

export const users = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    nombre: text("nombre"),
    rol: userRoleEnum("rol").notNull().default("admin"),
    // Dueño (admin) apunta a la organización; supervisor a una sucursal (localId).
    organizacionId: uuid("organizacion_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    localId: uuid("local_id").references(() => locales.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uq_usuarios_email").on(t.email)],
);

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

export const orders = pgTable(
  "pedidos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),

    // Numero o nombre visible del pedido (ej: "42" o "Miguel").
    referencia: text("referencia").notNull(),

    estado: orderStatusEnum("estado").notNull().default("creado"),

    // Empleado que tomo / atiende el pedido (para metricas por persona).
    empleadoId: uuid("empleado_id").references(() => employees.id, {
      onDelete: "set null",
    }),

    // Token unico que viaja en el QR. Se invalida al terminar el dia.
    qrToken: text("qr_token").notNull(),
    qrExpiraEn: timestamp("qr_expira_en", { withTimezone: true }).notNull(),

    // Timestamps de cada cambio de estado (para metricas).
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    enPreparacionEn: timestamp("en_preparacion_en", { withTimezone: true }),
    listoEn: timestamp("listo_en", { withTimezone: true }),
    retiradoEn: timestamp("retirado_en", { withTimezone: true }),
    canceladoEn: timestamp("cancelado_en", { withTimezone: true }),
    // Cuándo el cliente abrió el link del QR (para cerrar el popup en la caja).
    vistoEn: timestamp("visto_en", { withTimezone: true }),
    // Último aviso "listo" (marcar listo o "Volver a avisar"). La vista del
    // cliente pollea esto para repetir confeti/vibración aunque el estado no cambie.
    avisadoEn: timestamp("avisado_en", { withTimezone: true }),
  },
  (t) => [
    // Busqueda rapida de pedidos por local + estado (vista del panel).
    index("idx_pedidos_local_estado").on(t.localId, t.estado),
    // El token debe ser unico para resolver la vista del cliente por token.
    uniqueIndex("uq_pedidos_qr_token").on(t.qrToken),
    // Para las metricas del dia.
    index("idx_pedidos_local_creado").on(t.localId, t.creadoEn),
  ],
);

// ---------------------------------------------------------------------------
// Suscripciones Web Push del cliente (por pedido / navegador)
// Se guarda para poder empujar el aviso cuando el pedido pasa a "listo".
// ---------------------------------------------------------------------------

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pedidoId: uuid("pedido_id").references(() => orders.id, {
      onDelete: "cascade",
    }),
    esperaId: uuid("espera_id"),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_push_pedido").on(t.pedidoId)],
);

// ---------------------------------------------------------------------------
// Solicitudes de prueba (leads del formulario "Probá gratis" de la web)
// ---------------------------------------------------------------------------

export const solicitudes = pgTable("solicitudes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  email: text("email").notNull(),
  telefono: text("telefono"),
  local: text("local"),
  ciudad: text("ciudad"),
  direccion: text("direccion"),
  // CUIL/CUIT (11 dígitos) — pedido en contratar plan
  cuil: text("cuil"),
  // nueva | atendida | descartada
  estado: text("estado").notNull().default("nueva"),
  // prueba | contrato
  tipo: text("tipo").notNull().default("prueba"),
  // mensual | anual (solo contrato)
  plan: text("plan"),
  // pedidos | espera | pack (solo contrato)
  pack: text("pack"),
  creadoEn: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Solicitud = typeof solicitudes.$inferSelect;

// ---------------------------------------------------------------------------
// Pedidos de sucursal extra (dueño pide +1 cupo)
// ---------------------------------------------------------------------------

export const pedidosSucursal = pgTable("pedidos_sucursal", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizacionId: uuid("organizacion_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  cupoActual: integer("cupo_actual").notNull(),
  cupoPedido: integer("cupo_pedido").notNull(),
  nombreSucursal: text("nombre_sucursal"),
  // nueva | atendida | descartada
  estado: text("estado").notNull().default("nueva"),
  creadoEn: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PedidoSucursal = typeof pedidosSucursal.$inferSelect;

// ---------------------------------------------------------------------------
// Espera de mesa (módulo aparte de pedidos)
// ---------------------------------------------------------------------------

export const esperaStatusEnum = pgEnum("espera_estado", [
  "esperando",
  "avisado",
  "sentado",
  "cancelado",
]);

export const esperas = pgTable(
  "esperas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    personas: integer("personas").notNull().default(2),
    estado: esperaStatusEnum("estado").notNull().default("esperando"),
    mesaNumero: integer("mesa_numero"),
    qrToken: text("qr_token").notNull(),
    qrExpiraEn: timestamp("qr_expira_en", { withTimezone: true }).notNull(),
    empleadoId: uuid("empleado_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    avisadoEn: timestamp("avisado_en", { withTimezone: true }),
    sentadoEn: timestamp("sentado_en", { withTimezone: true }),
    canceladoEn: timestamp("cancelado_en", { withTimezone: true }),
    vistoEn: timestamp("visto_en", { withTimezone: true }),
  },
  (t) => [
    index("idx_esperas_local_estado").on(t.localId, t.estado),
    uniqueIndex("uq_esperas_qr_token").on(t.qrToken),
    index("idx_esperas_local_creado").on(t.localId, t.creadoEn),
  ],
);

export const reservaStatusEnum = pgEnum("reserva_estado", [
  "activa",
  "sentada",
  "cancelada",
  "expirada",
]);

export const reservas = pgTable(
  "reservas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    personas: integer("personas").notNull().default(2),
    mesaNumero: integer("mesa_numero").notNull(),
    horario: timestamp("horario", { withTimezone: true }).notNull(),
    graciaMinutos: integer("gracia_minutos").notNull().default(15),
    estado: reservaStatusEnum("estado").notNull().default("activa"),
    empleadoId: uuid("empleado_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentadoEn: timestamp("sentado_en", { withTimezone: true }),
    canceladoEn: timestamp("cancelado_en", { withTimezone: true }),
    expiradoEn: timestamp("expirado_en", { withTimezone: true }),
  },
  (t) => [
    index("idx_reservas_local_horario").on(t.localId, t.horario),
    index("idx_reservas_local_estado").on(t.localId, t.estado),
  ],
);

export const mesas = pgTable(
  "mesas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    estado: text("estado").notNull().default("libre"),
    capacidad: integer("capacidad").notNull().default(4),
    esperaId: uuid("espera_id").references(() => esperas.id, {
      onDelete: "set null",
    }),
    reservaId: uuid("reserva_id").references(() => reservas.id, {
      onDelete: "set null",
    }),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_mesas_local").on(t.localId),
    uniqueIndex("uq_mesas_local_numero").on(t.localId, t.numero),
  ],
);

// ---------------------------------------------------------------------------
// Relaciones
// ---------------------------------------------------------------------------

export const organizationsRelations = relations(organizations, ({ many }) => ({
  locales: many(locales),
  usuarios: many(users),
}));

export const localesRelations = relations(locales, ({ one, many }) => ({
  organizacion: one(organizations, {
    fields: [locales.organizacionId],
    references: [organizations.id],
  }),
  pedidos: many(orders),
  empleados: many(employees),
}));

export const employeesRelations = relations(employees, ({ one }) => ({
  local: one(locales, {
    fields: [employees.localId],
    references: [locales.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  local: one(locales, {
    fields: [orders.localId],
    references: [locales.id],
  }),
  empleado: one(employees, {
    fields: [orders.empleadoId],
    references: [employees.id],
  }),
  pushSubscriptions: many(pushSubscriptions),
}));

export const usersRelations = relations(users, ({ one }) => ({
  organizacion: one(organizations, {
    fields: [users.organizacionId],
    references: [organizations.id],
  }),
  local: one(locales, {
    fields: [users.localId],
    references: [locales.id],
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

// ---------------------------------------------------------------------------
// Tipos inferidos (para usar en toda la app)
// ---------------------------------------------------------------------------

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Local = typeof locales.$inferSelect;
export type NuevoLocal = typeof locales.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type Usuario = typeof users.$inferSelect;
export type NuevoUsuario = typeof users.$inferInsert;
export type IdentificationMode = (typeof identificationModeEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];

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
export const modoIdentificacionEnum = pgEnum("modo_identificacion", [
  "pedido",
  "nombre",
  "mesa",
]);

// Roles de cuenta con login real (email + contraseña):
//  - superadmin: Cicalino (nosotros). Da de alta locales y sus admins.
//  - admin: dueño del local. Gestiona su local, empleados y metricas.
//  - supervisor: gestiona mesas/empleados del local, SIN acceso a metricas.
// Los empleados NO son usuarios: son perfiles con PIN dentro del local.
export const rolUsuarioEnum = pgEnum("rol_usuario", [
  "superadmin",
  "admin",
  "supervisor",
]);

// ---------------------------------------------------------------------------
// Locales (tenants)
// ---------------------------------------------------------------------------

export const locales = pgTable("locales", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  tipoNegocio: businessTypeEnum("tipo_negocio").notNull().default("otro"),
  // Responsable fiscal / dueño del negocio.
  responsable: text("responsable"),
  cuil: text("cuil"),
  whatsapp: text("whatsapp"),
  direccion: text("direccion"),
  // slug corto para URLs amigables del local (ej: cicalino.ar/l/mi-cafe)
  slug: text("slug").notNull(),
  // Como se identifica cada pedido (lo elige el local en la config).
  modoIdentificacion: modoIdentificacionEnum("modo_identificacion")
    .notNull()
    .default("pedido"),
  // Cantidad de mesas (solo aplica si modoIdentificacion = "mesa").
  cantidadMesas: integer("cantidad_mesas"),
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

export const empleados = pgTable(
  "empleados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localId: uuid("local_id")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    rol: text("rol"),
    // PIN corto (4 digitos) para fichar en el dispositivo compartido.
    pin: text("pin"),
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

export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    nombre: text("nombre"),
    rol: rolUsuarioEnum("rol").notNull().default("admin"),
    // El superadmin no tiene local; el admin apunta a su local.
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

export const pedidos = pgTable(
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
    empleadoId: uuid("empleado_id").references(() => empleados.id, {
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
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedidos.id, { onDelete: "cascade" }),
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
// Relaciones
// ---------------------------------------------------------------------------

export const localesRelations = relations(locales, ({ many }) => ({
  pedidos: many(pedidos),
  empleados: many(empleados),
}));

export const empleadosRelations = relations(empleados, ({ one }) => ({
  local: one(locales, {
    fields: [empleados.localId],
    references: [locales.id],
  }),
}));

export const pedidosRelations = relations(pedidos, ({ one, many }) => ({
  local: one(locales, {
    fields: [pedidos.localId],
    references: [locales.id],
  }),
  empleado: one(empleados, {
    fields: [pedidos.empleadoId],
    references: [empleados.id],
  }),
  pushSubscriptions: many(pushSubscriptions),
}));

export const usuariosRelations = relations(usuarios, ({ one }) => ({
  local: one(locales, {
    fields: [usuarios.localId],
    references: [locales.id],
  }),
}));

export const pushSubscriptionsRelations = relations(
  pushSubscriptions,
  ({ one }) => ({
    pedido: one(pedidos, {
      fields: [pushSubscriptions.pedidoId],
      references: [pedidos.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// Tipos inferidos (para usar en toda la app)
// ---------------------------------------------------------------------------

export type Local = typeof locales.$inferSelect;
export type NuevoLocal = typeof locales.$inferInsert;
export type Pedido = typeof pedidos.$inferSelect;
export type NuevoPedido = typeof pedidos.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type Empleado = typeof empleados.$inferSelect;
export type NuevoEmpleado = typeof empleados.$inferInsert;
export type Usuario = typeof usuarios.$inferSelect;
export type NuevoUsuario = typeof usuarios.$inferInsert;
export type ModoIdentificacion = (typeof modoIdentificacionEnum.enumValues)[number];
export type RolUsuario = (typeof rolUsuarioEnum.enumValues)[number];

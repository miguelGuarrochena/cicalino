import { z } from "zod";
import { BRAND_COLOR_IDS } from "@/lib/customerBrand";
import {
  cuil,
  email,
  orderStatus,
  identificationMode,
  pin4,
  plan,
  telefono,
  textField,
  optionalTextField,
  tipoNegocio,
  uuid,
} from "./common";

export * from "./common";

export const leadSchema = z.object({
  name: textField(2, 120, "tu nombre"),
  email,
  telefono,
  cuil,
  local: optionalTextField(120, "el nombre del local"),
  ciudad: optionalTextField(80, "la ciudad"),
  direccion: optionalTextField(160, "la dirección"),
  tipo: z.enum(["prueba", "contrato"]).optional().default("prueba"),
  plan: z.enum(["mensual", "anual"]).optional(),
  pack: z
    .enum(["pedidos", "espera", "pagos", "pack", "pedidos_pagos", "espera_pagos", "completo"])
    .optional(),
  turnstileToken: z.string().max(2048).optional(),
}).superRefine((v, ctx) => {
  if (v.tipo !== "contrato") return;
  if (!v.plan) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Elegí un plan (mensual o anual).",
      path: ["plan"],
    });
  }
  if (!v.pack) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Elegí qué módulos querés contratar.",
      path: ["pack"],
    });
  }
  if (!v.local || v.local.length < 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Completá el nombre del local o empresa.",
      path: ["local"],
    });
  }
  if (!(v.telefono && v.telefono.replace(/\D/g, "").length >= 8)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Completá un teléfono válido (mín. 8 dígitos).",
      path: ["telefono"],
    });
  }
  if (!(v.cuil && v.cuil.length === 11)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Completá un CUIL/CUIT válido (11 dígitos).",
      path: ["cuil"],
    });
  }
});
export type LeadInput = z.infer<typeof leadSchema>;

export const branchInputSchema = z.object({
  name: textField(2, 80, "el nombre de la sucursal"),
  tipo: tipoNegocio,
  direccion: optionalTextField(160, "la dirección"),
  moduloPedidos: z.boolean().optional().default(true),
  moduloEspera: z.boolean().optional().default(false),
  moduloPagos: z.boolean().optional().default(false),
});

export const createOrganizationSchema = z.object({
  name: textField(2, 120, "el nombre de la empresa"),
  responsable: textField(2, 120, "el responsable"),
  telefono,
  cuil,
  direccion: optionalTextField(160, "la dirección"),
  ownerEmail: email,
  cupo: z.coerce
    .number()
    .int("El cupo tiene que ser un número entero.")
    .min(1, "El cupo mínimo es 1.")
    .max(500, "El cupo máximo es 500.")
    .optional()
    .default(1),
  plan: plan.optional().default("mensual"),
  mesGratis: z.boolean().optional().default(false),
  moduloPedidos: z.boolean().optional().default(true),
  moduloEspera: z.boolean().optional().default(false),
  moduloPagos: z.boolean().optional().default(false),
  sucursales: z
    .array(branchInputSchema)
    .max(500, "Demasiadas sucursales en un solo alta.")
    .default([]),
}).superRefine((v, ctx) => {
  if (!v.moduloPedidos && !v.moduloEspera && !v.moduloPagos) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Elegí al menos un módulo (Pedidos, Espera o Pagos divididos).",
      path: ["moduloPedidos"],
    });
  }
});
/* Salida del parseo: los defaults ya aplicados. Es lo que recibe la capa que
 * escribe en la base. */
export type CreateOrgInput = z.infer<typeof createOrganizationSchema>;

/* Entrada del parseo: lo que se le pasa a `parseInput`. Tiparlo con esto hace
 * que TypeScript rechace claves mal escritas (`nombre` en vez de `name`), que
 * de otro modo sólo fallan en runtime porque `parseInput` acepta `unknown`. */
export type CreateOrgPayload = z.input<typeof createOrganizationSchema>;

export const idSchema = z.object({ id: uuid });

export const branchConfigSchema = z
  .object({
    name: textField(2, 80, "el nombre de la sucursal"),
    tipo: tipoNegocio,
    whatsapp: telefono,
    direccion: optionalTextField(160, "la dirección"),
    modo: identificationMode,
    tableCount: z.coerce
      .number()
      .int()
      .min(1, "Tiene que haber al menos 1 mesa.")
      .max(500, "Máximo 500 mesas."),
    cutoffHour: z.coerce
      .number()
      .int()
      .min(0, "La hora de corte va de 0 a 23.")
      .max(23, "La hora de corte va de 0 a 23."),
    reservaAbreMin: z.coerce
      .number()
      .int()
      .min(0, "El horario de apertura va de 0 a 1439.")
      .max(1439, "El horario de apertura va de 0 a 1439."),
    reservaCierraMin: z.coerce
      .number()
      .int()
      .min(0, "El horario de cierre va de 0 a 1439.")
      .max(1439, "El horario de cierre va de 0 a 1439."),
    diasCerrados: z
      .array(z.coerce.number().int().min(0).max(6))
      .max(6, "No podés cerrar todos los días."),
  })
  .refine((v) => v.modo !== "mesa" || v.tableCount >= 1, {
    message: "Con modo 'mesa' necesitás definir la cantidad de mesas.",
    path: ["tableCount"],
  })
  .refine((v) => v.reservaAbreMin < v.reservaCierraMin, {
    message: "La apertura tiene que ser antes del cierre.",
    path: ["reservaCierraMin"],
  })
  .refine((v) => new Set(v.diasCerrados).size < 7, {
    message: "Dejá al menos un día abierto para reservas.",
    path: ["diasCerrados"],
  });
export type BranchConfigInput = z.infer<typeof branchConfigSchema>;

export const pedidosModalidad = z.enum(["mostrador", "mesa"], {
  errorMap: () => ({ message: "Modalidad de Pedidos inválida." }),
});

export const branchOperacionSchema = z
  .object({
    modo: identificationMode,
    pedidosModalidad: pedidosModalidad.default("mostrador"),
    tableCount: z.coerce
      .number()
      .int()
      .min(1, "Tiene que haber al menos 1 mesa.")
      .max(500, "Máximo 500 mesas."),
    cutoffHour: z.coerce
      .number()
      .int()
      .min(0, "La hora de corte va de 0 a 23.")
      .max(23, "La hora de corte va de 0 a 23."),
    reservaAbreMin: z.coerce
      .number()
      .int()
      .min(0)
      .max(1439)
      .default(660),
    reservaCierraMin: z.coerce
      .number()
      .int()
      .min(0)
      .max(1439)
      .default(1380),
    diasCerrados: z
      .array(z.coerce.number().int().min(0).max(6))
      .max(6)
      .default([]),
  })
  .refine((v) => v.modo !== "mesa" || v.tableCount >= 1, {
    message: "Con modo 'mesa' necesitás definir la cantidad de mesas.",
    path: ["tableCount"],
  })
  .refine((v) => v.reservaAbreMin < v.reservaCierraMin, {
    message: "La apertura tiene que ser antes del cierre.",
    path: ["reservaCierraMin"],
  })
  .refine((v) => new Set(v.diasCerrados).size < 7, {
    message: "Dejá al menos un día abierto para reservas.",
    path: ["diasCerrados"],
  });
export type BranchOperacionInput = z.infer<typeof branchOperacionSchema>;

export const branchBrandSchema = z.object({
  name: textField(2, 80, "el nombre del local"),
  logoUrl: z
    .string()
    .max(120_000, "El logo es demasiado pesado.")
    .nullable()
    .refine(
      (v) => v === null || v.startsWith("data:image/"),
      "Logo inválido.",
    ),
  colorMarca: z.enum(BRAND_COLOR_IDS).nullable(),
});
export type BranchBrandInput = z.infer<typeof branchBrandSchema>;

export const employeeSchema = z.object({
  name: textField(2, 80, "el nombre del empleado"),
  rol: optionalTextField(60, "el rol"),
  pin: pin4,
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

export const newOrderSchema = z.object({
  branchId: uuid,
  /* null/omit = el RPC asigna el próximo número de la jornada. */
  reference: textField(1, 40, "la referencia del pedido").nullable().optional(),
  employeeId: uuid.nullable().optional(),
});
export type NewOrderInput = z.infer<typeof newOrderSchema>;

/* Nombre opcional del cliente en /p/{token}. Vacío = borrar. */
export const customerAliasSchema = z
  .string({ invalid_type_error: "Nombre inválido." })
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .refine(
    (s) => s === "" || (s.length >= 2 && s.length <= 24),
    "El nombre tiene que tener entre 2 y 24 caracteres.",
  )
  .refine(
    (s) => s === "" || /^[\p{L}\p{N} .'\-]+$/u.test(s),
    "Usá solo letras, números y espacios.",
  )
  .transform((s) => (s === "" ? null : s));
export type CustomerAlias = z.infer<typeof customerAliasSchema>;

/* Espejo de chequear_transicion_pedido (pedidos-mesa.sql). `pendiente_pago`
 * es el pedido de la mesa que todavía no se pagó: solo sale cobrándolo (lo
 * decide la base, que además exige el cobro) o cancelándolo. */
const TRANSICIONES: Record<string, readonly string[]> = {
  pendiente_pago: ["creado", "cancelado"],
  creado: ["en_preparacion", "listo", "cancelado"],
  en_preparacion: ["listo", "cancelado"],
  listo: ["retirado", "cancelado"],
  retirado: [],
  cancelado: [],
};

export const isValidTransition = (desde: string, hacia: string): boolean =>
  (TRANSICIONES[desde] ?? []).includes(hacia);

/* Espera y reservas: las mismas máquinas de estado que valen para pedidos,
 * que hasta ahora no existían en ningún lado. Son el espejo de los triggers
 * de supabase/espera-constraints.sql; si cambia una tiene que cambiar el otro.
 *
 * Salen de lo que ofrece el panel: a una espera se la avisa, se la sienta o
 * se la cancela, y una vez sentada o cancelada no se toca más. */
const TRANSICIONES_ESPERA: Record<string, readonly string[]> = {
  esperando: ["avisado", "sentado", "cancelado"],
  avisado: ["sentado", "cancelado"],
  sentado: [],
  cancelado: [],
};

const TRANSICIONES_RESERVA: Record<string, readonly string[]> = {
  activa: ["sentada", "cancelada", "expirada"],
  sentada: [],
  cancelada: [],
  expirada: [],
};

export const isValidWaitlistTransition = (
  desde: string,
  hacia: string,
): boolean => (TRANSICIONES_ESPERA[desde] ?? []).includes(hacia);

export const isValidReservationTransition = (
  desde: string,
  hacia: string,
): boolean => (TRANSICIONES_RESERVA[desde] ?? []).includes(hacia);

/* Desde qué estados se puede llegar a `hacia`.
 *
 * Sirve para hacer compare-and-swap sin que el llamador tenga que saber el
 * estado actual: en vez de `update ... where id = $1`, va
 * `update ... where id = $1 and estado in (origenes)`. Si otro dispositivo se
 * adelantó, el update no afecta ninguna fila en vez de pisarlo. */
const origenes = (
  tabla: Record<string, readonly string[]>,
  hacia: string,
): string[] =>
  Object.keys(tabla).filter((desde) => tabla[desde]!.includes(hacia));

export const waitlistTransitionSources = (hacia: string): string[] =>
  origenes(TRANSICIONES_ESPERA, hacia);

export const reservationTransitionSources = (hacia: string): string[] =>
  origenes(TRANSICIONES_RESERVA, hacia);

export const orderTransitionSources = (hacia: string): string[] =>
  origenes(TRANSICIONES, hacia);

export const statusChangeSchema = z
  .object({
    id: uuid,
    desde: orderStatus,
    hacia: orderStatus,
  })
  .refine((v) => isValidTransition(v.desde, v.hacia), {
    message: "Ese cambio de estado no está permitido.",
    path: ["hacia"],
  });

const PUSH_HOSTS = [
  "android.googleapis.com",
  "fcm.googleapis.com",
  "fcmregistrations.googleapis.com",
  "web.push.apple.com",
];

const hostDePushValido = (raw: string): boolean => {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  return (
    PUSH_HOSTS.some((d) => h === d || h.endsWith(`.${d}`)) ||
    (h.endsWith(".googleapis.com") &&
      (h.includes("fcm") || h.includes("android") || h.startsWith("jnn-"))) ||
    h.endsWith(".push.services.mozilla.com") ||
    h.endsWith(".notify.windows.com")
  );
};

export const pushSubscribeSchema = z.object({
  token: uuid,
  subscription: z.object({
    endpoint: z
      .string()
      .url("Endpoint inválido.")
      .max(1000, "Endpoint demasiado largo.")
      .refine(hostDePushValido, "Endpoint de push no permitido."),
    keys: z.object({
      p256dh: z.string().min(8).max(200),
      auth: z.string().min(4).max(100),
    }),
  }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushNotifySchema = z
  .object({
    orderId: uuid.optional(),
    waitlistId: uuid.optional(),
  })
  .refine((v) => Boolean(v.orderId) !== Boolean(v.waitlistId), {
    message: "Mandá orderId o waitlistId (uno solo).",
  });

export const qrTokenSchema = uuid;

/* ---- Split payments -------------------------------------------------------
 * Shape checks only. Amounts, modes and ownership are decided again in SQL
 * (supabase/split-payments.sql); these keep garbage out of the RPC calls. */

export const guestNameSchema = customerAliasSchema.refine(
  (v): v is string => v !== null,
  "Contanos tu nombre.",
);

/* `<guestId>.<secret>` from join; 36-char UUID + '.' + 43-char base64url. */
export const guestRestoreSchema = z.object({
  cred: z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/i,
    "Sesión inválida.",
  ),
});

const cantidad = z.coerce.number().int().min(1).max(50);
const pesos = z.coerce.number().int().min(1).max(10_000_000);

export const guestOrderSchema = z.object({
  key: uuid,
  items: z
    .array(z.object({ productId: uuid, quantity: cantidad }))
    .min(1, "El pedido está vacío.")
    .max(30, "Demasiados productos en un pedido.")
    .refine(
      (items) => new Set(items.map((i) => i.productId)).size === items.length,
      "Producto repetido.",
    ),
});

/* Pedidos en modalidad Mesa: el pedido sale con la forma de pago elegida.
 * Lo que cuesta lo vuelve a calcular la base con los precios de la carta. */
export const pickupPayMethodSchema = z.enum(["caja", "mercado_pago"]);

export const pickupOrderSchema = guestOrderSchema.extend({
  method: pickupPayMethodSchema,
});

export const pickupPaySchema = z.object({ method: pickupPayMethodSchema });

/* Lo que la caja puede elegir al cobrar: la plata en mano, nunca el checkout
 * online (ese lo confirma solo el webhook). */
export const counterChargeMethodSchema = z.enum([
  "efectivo",
  "tarjeta_debito",
  "tarjeta_credito",
  "transferencia",
  "qr_mercado_pago",
]);

export const splitModeSchema = z.enum(["consumo", "iguales", "uno", "monto", "porcentaje"]);
export const guestShareModeSchema = z.enum(["consumo", "iguales", "monto", "porcentaje"]);
export const paymentMethodSchema = z.enum([
  "mercado_pago",
  "transferencia",
  "efectivo",
  "qr_mercado_pago",
  "tarjeta_debito",
  "tarjeta_credito",
]);

const paymentBase = {
  key: uuid,
  mode: splitModeSchema,
  method: paymentMethodSchema,
  parts: z.coerce.number().int().min(1).max(50).optional(),
  totalParts: z.coerce.number().int().min(1).max(50).optional(),
  amount: pesos.optional().nullable(),
  percent: z.coerce.number().gt(0).max(100).optional().nullable(),
  tipPercent: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(15)]).optional().nullable(),
  tipAmount: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
};

export const guestPaymentSchema = z.object({
  ...paymentBase,
  expectedTotal: z.coerce.number().int().min(1).max(30_000_000),
});

export const guestShareSchema = z.object({
  key: uuid,
  mode: guestShareModeSchema,
  method: paymentMethodSchema,
  parts: z.coerce.number().int().min(1).max(50).optional(),
  totalParts: z.coerce.number().int().min(1).max(50).optional(),
  amount: pesos.optional().nullable(),
  percent: z.coerce.number().gt(0).max(100).optional().nullable(),
  tipPercent: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(15)]).optional().nullable(),
  tipAmount: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
  expectedTotal: z.coerce.number().int().min(1).max(30_000_000),
});

export const guestPayAllSchema = z.object({
  key: uuid,
  method: paymentMethodSchema,
  tipPercent: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(15)]).optional().nullable(),
  tipAmount: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
  expectedTotal: z.coerce.number().int().min(1).max(30_000_000),
});

export const staffPaymentSchema = z
  .object({
    ...paymentBase,
    method: paymentMethodSchema.exclude(["mercado_pago"]),
    guestId: uuid.optional().nullable(),
    payerName: z.string().trim().min(1).max(40).optional().nullable(),
    confirmed: z.boolean().default(true),
  })
  .refine((v) => v.guestId || v.payerName, {
    message: "Indicá quién paga.",
    path: ["payerName"],
  });

/* Draft → the jsonb that _crear_pago_mesa reads. A percentage tip wins over a
 * fixed one, same as in SQL. */
export const paymentDatos = (
  v:
    | z.infer<typeof guestPaymentSchema>
    | z.infer<typeof staffPaymentSchema>
    | z.infer<typeof guestShareSchema>
    | (z.infer<typeof guestPayAllSchema> & { mode?: "uno" }),
): Record<string, unknown> => {
  const d: Record<string, unknown> = {
    clave: v.key,
    modo: "mode" in v && v.mode ? v.mode : "uno",
    metodo: v.method,
  };
  if ("parts" in v && v.parts != null) d.partes = v.parts;
  if ("totalParts" in v && v.totalParts != null) d.partes_totales = v.totalParts;
  if ("amount" in v && v.amount != null) d.monto = v.amount;
  else if ("percent" in v && v.percent != null) d.porcentaje = v.percent;
  if (v.tipPercent != null) d.propina_porcentaje = v.tipPercent;
  else if (v.tipAmount != null) d.propina_monto = v.tipAmount;
  if ("expectedTotal" in v) d.monto_esperado = v.expectedTotal;
  if ("guestId" in v && v.guestId) d.comensal_id = v.guestId;
  if ("payerName" in v && v.payerName) d.pagador_nombre = v.payerName;
  if ("confirmed" in v) d.confirmado = v.confirmed;
  return d;
};

const pesosCero = z.coerce.number().int().min(0).max(10_000_000);

export const menuProductSchema = z.object({
  name: textField(1, 80, "el nombre del producto"),
  description: optionalTextField(200, "la descripción"),
  category: optionalTextField(40, "la categoría"),
  price: pesos,
  cost: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    pesosCero.nullable().optional(),
  ),
  imageUrl: z
    .string()
    .trim()
    .max(200_000, "la imagen es demasiado pesada.")
    .optional()
    .nullable()
    .transform((v) => (v ? v : undefined))
    .refine(
      (v) =>
        !v ||
        v.startsWith("https://") ||
        v.startsWith("http://") ||
        v.startsWith("data:image/"),
      "La imagen tiene que ser una URL o un archivo de foto.",
    ),
  active: z.boolean().default(true),
  order: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const menuCategorySchema = z.object({
  name: textField(1, 40, "el nombre de la categoría"),
  active: z.boolean().default(true),
  order: z.coerce.number().int().min(0).max(10_000).default(0),
});

const pct = z.coerce.number().min(0, "Mínimo 0%.").max(20, "Máximo 20%.");

export const paymentSettingsSchema = z
  .object({
    mercadoPago: z.boolean(),
    transfer: z.boolean(),
    cash: z.boolean(),
    mpQr: z.boolean(),
    debit: z.boolean(),
    credit: z.boolean(),
    transferAlias: optionalTextField(60, "el alias"),
    transferHolder: optionalTextField(80, "el titular"),
    transferCbu: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => (v ? v.replace(/\D/g, "") : undefined))
      .refine((v) => !v || v.length === 22, "El CBU/CVU tiene 22 dígitos."),
    debitSurchargePct: pct,
    creditSurchargePct: pct,
    surchargeDeclared: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.transfer && (!v.transferAlias || !v.transferHolder)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Para transferencias completá alias y titular.",
        path: ["transferAlias"],
      });
    }
    if ((v.debitSurchargePct > 0 || v.creditSurchargePct > 0) && !v.surchargeDeclared) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Para cobrar recargo tenés que confirmar que la normativa te lo permite.",
        path: ["surchargeDeclared"],
      });
    }
    if (!v.mercadoPago && !v.transfer && !v.cash && !v.debit && !v.credit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dejá al menos un método de pago.",
        path: ["cash"],
      });
    }
  });

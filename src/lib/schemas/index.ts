import { z } from "zod";
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
  pack: z.enum(["pedidos", "espera", "pack"]).optional(),
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
      message: "Elegí un módulo (pedidos, espera o pack).",
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
  sucursales: z
    .array(branchInputSchema)
    .max(500, "Demasiadas sucursales en un solo alta.")
    .default([]),
}).superRefine((v, ctx) => {
  if (!v.moduloPedidos && !v.moduloEspera) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Elegí al menos un módulo (Pedidos o Espera).",
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

export const branchOperacionSchema = z
  .object({
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

const TRANSICIONES: Record<string, readonly string[]> = {
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

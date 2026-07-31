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
export type CreateOrgInput = z.infer<typeof createOrganizationSchema>;

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
  })
  .refine((v) => v.modo !== "mesa" || v.tableCount >= 1, {
    message: "Con modo 'mesa' necesitás definir la cantidad de mesas.",
    path: ["tableCount"],
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
  })
  .refine((v) => v.modo !== "mesa" || v.tableCount >= 1, {
    message: "Con modo 'mesa' necesitás definir la cantidad de mesas.",
    path: ["tableCount"],
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
  reference: textField(1, 40, "la referencia del pedido"),
  employeeId: uuid.nullable().optional(),
});
export type NewOrderInput = z.infer<typeof newOrderSchema>;

const TRANSICIONES: Record<string, readonly string[]> = {
  creado: ["en_preparacion", "listo", "cancelado"],
  en_preparacion: ["listo", "cancelado"],
  listo: ["retirado", "cancelado"],
  retirado: [],
  cancelado: [],
};

export const isValidTransition = (desde: string, hacia: string): boolean =>
  (TRANSICIONES[desde] ?? []).includes(hacia);

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

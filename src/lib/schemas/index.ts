import { z } from "zod";
import {
  cuil,
  email,
  estadoPedido,
  modoIdentificacion,
  pin4,
  plan,
  telefono,
  texto,
  textoOpcional,
  tipoNegocio,
  uuid,
} from "./comunes";

export * from "./comunes";

// ---------------------------------------------------------------------------
// Leads — formulario público /probar. Es el único input de gente anónima que
// llega a la base, así que es el que más ajustado tiene que estar.
// ---------------------------------------------------------------------------

export const solicitudSchema = z.object({
  nombre: texto(2, 120, "tu nombre"),
  email,
  local: textoOpcional(120, "el nombre del local"),
  ciudad: textoOpcional(80, "la ciudad"),
  // El token de Turnstile lo emite Cloudflare; solo acotamos el tamaño.
  turnstileToken: z.string().max(2048).optional(),
});
export type SolicitudInput = z.infer<typeof solicitudSchema>;

// ---------------------------------------------------------------------------
// Organizaciones y sucursales — solo superadmin.
// ---------------------------------------------------------------------------

export const sucursalInputSchema = z.object({
  nombre: texto(2, 80, "el nombre de la sucursal"),
  tipo: tipoNegocio,
  direccion: textoOpcional(160, "la dirección"),
});

export const crearOrganizacionSchema = z.object({
  nombre: texto(2, 120, "el nombre de la empresa"),
  responsable: texto(2, 120, "el responsable"),
  telefono,
  cuil,
  direccion: textoOpcional(160, "la dirección"),
  duenoEmail: email,
  // Tope alto pero finito: evita que un typo genere un cobro absurdo.
  cupo: z.coerce
    .number()
    .int("El cupo tiene que ser un número entero.")
    .min(1, "El cupo mínimo es 1.")
    .max(500, "El cupo máximo es 500."),
  plan: plan.optional().default("mensual"),
  mesGratis: z.boolean().optional().default(false),
  sucursales: z
    .array(sucursalInputSchema)
    .max(500, "Demasiadas sucursales en un solo alta.")
    .default([]),
});
export type CrearOrganizacionInput = z.infer<typeof crearOrganizacionSchema>;

export const idSchema = z.object({ id: uuid });

// ---------------------------------------------------------------------------
// Configuración de sucursal (la edita el dueño desde el panel).
// ---------------------------------------------------------------------------

export const branchConfigSchema = z
  .object({
    nombre: texto(2, 80, "el nombre de la sucursal"),
    tipo: tipoNegocio,
    whatsapp: telefono,
    direccion: textoOpcional(160, "la dirección"),
    modo: modoIdentificacion,
    cantidadMesas: z.coerce
      .number()
      .int()
      .min(1, "Tiene que haber al menos 1 mesa.")
      .max(500, "Máximo 500 mesas."),
    horaCorte: z.coerce
      .number()
      .int()
      .min(0, "La hora de corte va de 0 a 23.")
      .max(23, "La hora de corte va de 0 a 23."),
  })
  .refine((v) => v.modo !== "mesa" || v.cantidadMesas >= 1, {
    message: "Con modo 'mesa' necesitás definir la cantidad de mesas.",
    path: ["cantidadMesas"],
  });
export type BranchConfigInput = z.infer<typeof branchConfigSchema>;

// ---------------------------------------------------------------------------
// Empleados.
// ---------------------------------------------------------------------------

export const empleadoSchema = z.object({
  nombre: texto(2, 80, "el nombre del empleado"),
  rol: textoOpcional(60, "el rol"),
  pin: pin4,
});
export type EmpleadoInput = z.infer<typeof empleadoSchema>;

// ---------------------------------------------------------------------------
// Pedidos.
// ---------------------------------------------------------------------------

export const nuevoPedidoSchema = z.object({
  branchId: uuid,
  // La referencia se imprime en el QR y se muestra en pantalla: corta.
  reference: texto(1, 40, "la referencia del pedido"),
  employeeId: uuid.nullable().optional(),
});
export type NuevoPedidoInput = z.infer<typeof nuevoPedidoSchema>;

/** Transiciones de estado permitidas. Antes cualquier estado iba a cualquiera. */
const TRANSICIONES: Record<string, readonly string[]> = {
  creado: ["en_preparacion", "listo", "cancelado"],
  en_preparacion: ["listo", "cancelado"],
  listo: ["retirado", "cancelado"],
  retirado: [],
  cancelado: [],
};

export const transicionValida = (desde: string, hacia: string): boolean =>
  (TRANSICIONES[desde] ?? []).includes(hacia);

export const cambioEstadoSchema = z
  .object({
    id: uuid,
    desde: estadoPedido,
    hacia: estadoPedido,
  })
  .refine((v) => transicionValida(v.desde, v.hacia), {
    message: "Ese cambio de estado no está permitido.",
    path: ["hacia"],
  });

// ---------------------------------------------------------------------------
// Web Push.
// ---------------------------------------------------------------------------

/** Servicios de push legítimos. Sin esto, el endpoint es un vector de SSRF. */
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
    // Chrome / Google a veces usan otros subdominios de googleapis.
    (h.endsWith(".googleapis.com") &&
      (h.includes("fcm") || h.includes("android") || h.startsWith("jnn-"))) ||
    h.endsWith(".push.services.mozilla.com") ||
    h.endsWith(".notify.windows.com")
  );
};

export const pushSubscribeSchema = z.object({
  // qr_token es un UUID v4 generado por nosotros.
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

export const pushNotifySchema = z.object({ orderId: uuid });

/** Token del QR en la URL pública /p/[token] y /api/p/[token]. */
export const qrTokenSchema = uuid;

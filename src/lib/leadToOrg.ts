import type { CreateOrgPayload } from "@/lib/schemas";
import { isPackId, modulesForPack } from "@/lib/pricing";

/* Fila cruda de `solicitudes` tal como la devuelve PostgREST: nombres de
 * columna de la base, no las propiedades del schema de Drizzle. */
export interface LeadRow {
  nombre: string;
  email: string;
  telefono?: string | null;
  local?: string | null;
  ciudad?: string | null;
  direccion?: string | null;
  cuil?: string | null;
  tipo?: string | null;
  plan?: string | null;
  pack?: string | null;
}

const soloDigitos = (v: unknown): string =>
  typeof v === "string" ? v.replace(/\D/g, "") : "";

/* Traduce una solicitud del formulario público al alta de organización.
 *
 * Es pura a propósito: es el punto donde se cruzan dos vocabularios (la base
 * habla castellano, el schema de alta habla inglés) y por lo tanto donde es
 * fácil equivocarse. Separada, se puede testear sin tocar Supabase.
 */
export const leadToOrgPayload = (sol: LeadRow): CreateOrgPayload => {
  const esContrato = sol.tipo === "contrato";

  const plan =
    sol.plan === "anual" || sol.plan === "mensual" ? sol.plan : "mensual";

  const pack = isPackId(sol.pack) ? sol.pack : "pedidos";

  /* Fuera de un contrato el alta es la prueba gratis: pedidos y nada más. */
  const mods = esContrato
    ? modulesForPack(pack)
    : { pedidos: true, espera: false, pagos: false };
  const moduloPedidos = mods.pedidos;
  const moduloEspera = mods.espera;
  const moduloPagos = mods.pagos;

  const direccion = sol.direccion || sol.ciudad || "";
  const cuil = soloDigitos(sol.cuil);

  return {
    name: sol.local || sol.nombre,
    responsable: sol.nombre,
    telefono: typeof sol.telefono === "string" ? sol.telefono : "",
    cuil: cuil.length === 11 ? cuil : "",
    direccion,
    ownerEmail: sol.email.trim().toLowerCase(),
    cupo: 1,
    plan: esContrato ? plan : "mensual",
    mesGratis: !esContrato,
    moduloPedidos,
    moduloEspera,
    moduloPagos,
    sucursales: [
      {
        name: sol.local || "Principal",
        tipo: "otro",
        direccion,
        moduloPedidos,
        moduloEspera,
        moduloPagos,
      },
    ],
  };
};

import type { CreateOrgPayload } from "@/lib/schemas";
import type { Lead } from "@/lib/db/schema";
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

/* Una solicitud sin responder, ya en el vocabulario de la app.
 *
 * No es `Lead` entera a propósito: `estado` lo fija la consulta que la trae y
 * la fecha no la muestra nadie. Prometer campos que no se leen es lo que hizo
 * falsa a la versión anterior de esta lista. Las claves salen de `Lead` con
 * `Pick` para que sigan al schema si alguna se renombra. */
export type LeadPendiente = Pick<
  Lead,
  | "id"
  | "name"
  | "email"
  | "telefono"
  | "local"
  | "ciudad"
  | "direccion"
  | "cuil"
  | "tipo"
  | "plan"
  | "pack"
>;

/* El mismo cruce de vocabularios que `leadToOrgPayload`, para la lista del
 * panel. Va acá, puro y testeable, por la misma razón: es donde es fácil
 * equivocarse, y de hecho se erró. `listLeads` casteaba la fila cruda a `Lead`
 * sin traducirla, así que llegaba con `nombre` y `estado` mientras el panel
 * leía `.name` y `.status`. Todo daba `undefined`, el filtro por estado no
 * encontraba nada y las solicitudes nuevas no se mostraron nunca. */
export const leadFromRow = (row: LeadRow & { id: string }): LeadPendiente => ({
  id: row.id,
  name: row.nombre ?? "",
  email: row.email ?? "",
  telefono: row.telefono ?? null,
  local: row.local ?? null,
  ciudad: row.ciudad ?? null,
  direccion: row.direccion ?? null,
  cuil: row.cuil ?? null,
  tipo: row.tipo ?? "prueba",
  plan: row.plan ?? null,
  pack: row.pack ?? null,
});

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

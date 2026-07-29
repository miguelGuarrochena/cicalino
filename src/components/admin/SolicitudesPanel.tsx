"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import {
  listarSolicitudes,
  activarSolicitud,
  descartarSolicitud,
} from "@/lib/actions/superadmin";
import { refreshOrganizations } from "@/lib/data/superadmin";
import type { Solicitud } from "@/lib/db/schema";

// Solicitudes de prueba (leads) pendientes. Solo aparece si hay alguna nueva.
export const SolicitudesPanel = () => {
  const { t } = useApp();
  const toast = useToast();
  const [items, setItems] = useState<Solicitud[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(await listarSolicitudes());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nuevas = items.filter((s) => s.estado === "nueva");
  if (nuevas.length === 0) return null;

  const activar = async (id: string) => {
    setBusy(id);
    const r = await activarSolicitud(id);
    setBusy(null);
    if (r.ok) {
      await load();
      await refreshOrganizations();
      toast(t("toast.leadActivada"), "success");
    } else {
      toast(t("toast.leadError"), "error");
    }
  };

  const descartar = async (id: string) => {
    setBusy(id);
    await descartarSolicitud(id);
    setBusy(null);
    await load();
    toast(t("toast.leadDescartada"), "info");
  };

  return (
    <section className="rounded-[24px] border border-marca/30 bg-marca/5 p-4 shadow-sm sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-marca">
        Solicitudes
        <span className="rounded-full bg-marca px-2 py-0.5 text-xs text-crema">
          {nuevas.length}
        </span>
      </h2>
      <ul className="flex flex-col gap-2">
        {nuevas.map((s) => {
          const esContrato = s.tipo === "contrato";
          const planLbl =
            s.plan === "anual" ? "Anual" : s.plan === "mensual" ? "Mensual" : "";
          return (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-2xl border border-linea bg-surface px-3 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-carbon">
                  {s.local || s.nombre}
                  <span className="ml-2 rounded-full bg-carbon/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-carbon/55">
                    {esContrato ? `Contrato${planLbl ? ` · ${planLbl}` : ""}` : "Prueba"}
                  </span>
                </p>
                <p className="truncate text-xs text-carbon/55">
                  {s.nombre} · {s.email}
                  {s.telefono ? ` · ${s.telefono}` : ""}
                  {s.ciudad ? ` · ${s.ciudad}` : ""}
                  {s.direccion ? ` · ${s.direccion}` : ""}
                  {s.cuil ? ` · CUIL ${s.cuil}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => activar(s.id)}
                  disabled={busy === s.id}
                  className="rounded-full bg-marca px-3 py-1.5 text-xs font-semibold text-crema transition hover:bg-marca-fuerte disabled:opacity-60"
                >
                  {busy === s.id
                    ? "…"
                    : esContrato
                      ? "Activar (pago)"
                      : "Activar (1 mes gratis)"}
                </button>
                <button
                  type="button"
                  onClick={() => descartar(s.id)}
                  disabled={busy === s.id}
                  className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/55 transition hover:bg-carbon/5 disabled:opacity-60"
                >
                  Descartar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

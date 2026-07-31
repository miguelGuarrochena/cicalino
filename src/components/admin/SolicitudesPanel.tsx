"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { Spinner } from "@/components/ui/Spinner";
import {
  listLeads,
  activateLead,
  dismissLead,
} from "@/lib/actions/superadmin";
import { refreshOrganizations } from "@/lib/data/superadmin";
import type { Lead } from "@/lib/db/schema";

export const SolicitudesPanel = () => {
  const { t } = useApp();
  const toast = useToast();
  const [items, setItems] = useState<Lead[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(await listLeads());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nuevas = items.filter((s) => s.status === "nueva");
  if (nuevas.length === 0) return null;

  const activar = async (id: string) => {
    setBusy(id);
    try {
      const r = await activateLead(id);
      if (r.ok) {
        await load();
        await refreshOrganizations();
        toast(t("toast.leadActivada"), "success");
      } else {
        toast(r.error || t("toast.leadError"), "error");
      }
    } catch (e) {
      console.error("activar solicitud", e);
      toast(t("toast.leadError"), "error");
    } finally {
      setBusy(null);
    }
  };

  const descartar = async (id: string) => {
    setBusy(id);
    await dismissLead(id);
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
          const packLbl =
            s.pack === "pack"
              ? "Pack"
              : s.pack === "espera"
                ? "Espera"
                : s.pack === "pedidos"
                  ? "Pedidos"
                  : "";
          const trabajando = busy === s.id;
          return (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-2xl border border-linea bg-surface px-3 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-carbon">
                  {s.local || s.name}
                  <span className="ml-2 rounded-full bg-carbon/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-carbon/55">
                    {esContrato
                      ? `Contrato${planLbl ? ` · ${planLbl}` : ""}${packLbl ? ` · ${packLbl}` : ""}`
                      : "Prueba"}
                  </span>
                </p>
                <p className="truncate text-xs text-carbon/55">
                  {s.name} · {s.email}
                  {s.telefono ? ` · ${s.telefono}` : ""}
                  {s.ciudad ? ` · ${s.ciudad}` : ""}
                  {s.direccion ? ` · ${s.direccion}` : ""}
                  {s.cuil ? ` · CUIL ${s.cuil}` : ""}
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:shrink-0 sm:flex-row sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => void activar(s.id)}
                  disabled={busy !== null}
                  className="gap-1.5 rounded-full bg-marca text-crema transition hover:bg-marca-fuerte disabled:opacity-60 flex min-h-11 items-center justify-center px-4 text-sm font-semibold sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-xs"
                >
                  {trabajando ? (
                    <>
                      <Spinner className="size-3.5 border-crema border-r-transparent" inline />
                      Preparando…
                    </>
                  ) : esContrato ? (
                    "Preparar cuenta"
                  ) : (
                    "Preparar (1 mes gratis)"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void descartar(s.id)}
                  disabled={busy !== null}
                  className="rounded-full border border-linea text-carbon/55 transition hover:bg-carbon/5 disabled:opacity-60 flex min-h-11 items-center justify-center px-4 text-sm font-semibold sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-xs"
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

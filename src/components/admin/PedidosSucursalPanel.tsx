"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Spinner } from "@/components/ui/Spinner";
import {
  listarPedidosSucursal,
  aprobarPedidoSucursal,
  descartarPedidoSucursal,
  type PedidoSucursalAdmin,
} from "@/lib/actions/pedidoSucursal";
import { refreshOrganizations } from "@/lib/data/superadmin";
import { montoContrato, etiquetaCiclo } from "@/lib/contrato";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

/** Pedidos de +1 sucursal del dueño. Solo aparecen si hay alguno nuevo. */
export const PedidosSucursalPanel = ({
  onAbrir,
}: {
  onAbrir?: (orgId: string) => void;
}) => {
  const toast = useToast();
  const [items, setItems] = useState<PedidoSucursalAdmin[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(await listarPedidosSucursal());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (items.length === 0) return null;

  const aprobar = async (id: string) => {
    setBusy(id);
    try {
      const r = await aprobarPedidoSucursal(id);
      if (!r.ok) {
        toast(r.error, "error");
        return;
      }
      await load();
      await refreshOrganizations();
      toast("Cupo actualizado · podés agregar la sucursal", "success");
      if (r.organizacionId && onAbrir) onAbrir(r.organizacionId);
    } finally {
      setBusy(null);
    }
  };

  const descartar = async (id: string) => {
    setBusy(id);
    await descartarPedidoSucursal(id);
    setBusy(null);
    await load();
    toast("Pedido descartado", "info");
  };

  return (
    <section className="rounded-[24px] border border-marca/30 bg-marca/5 p-4 shadow-sm sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-marca">
        Pedidos de sucursal
        <span className="rounded-full bg-marca px-2 py-0.5 text-xs text-crema">
          {items.length}
        </span>
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((p) => {
          const monto = montoContrato(
            p.orgPlan === "gratis" ? "mensual" : p.orgPlan,
            1,
          );
          return (
            <li
              key={p.id}
              className="flex flex-col gap-2 rounded-2xl border border-linea bg-surface px-3 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-carbon">
                  {p.orgNombre}
                  <span className="ml-2 rounded-full bg-carbon/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-carbon/55">
                    Cupo {p.cupoActual} → {p.cupoPedido}
                  </span>
                </p>
                <p className="truncate text-xs text-carbon/55">
                  {p.orgEmail}
                  {p.nombreSucursal ? ` · ${p.nombreSucursal}` : ""}
                  {" · "}
                  {money.format(monto)} / {etiquetaCiclo(p.orgPlan)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => void aprobar(p.id)}
                  disabled={busy !== null}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-marca px-3 py-1.5 text-xs font-semibold text-crema transition hover:bg-marca-fuerte disabled:opacity-60"
                >
                  {busy === p.id ? (
                    <>
                      <Spinner className="size-3.5 border-crema border-r-transparent" />
                      Aprobando…
                    </>
                  ) : (
                    "Aprobar (pago OK)"
                  )}
                </button>
                {onAbrir && (
                  <button
                    type="button"
                    onClick={() => onAbrir(p.organizacionId)}
                    disabled={busy !== null}
                    className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/70 transition hover:bg-carbon/5 disabled:opacity-60"
                  >
                    Ver
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void descartar(p.id)}
                  disabled={busy !== null}
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

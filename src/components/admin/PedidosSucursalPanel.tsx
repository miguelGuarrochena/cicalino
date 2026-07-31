"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Spinner } from "@/components/ui/Spinner";
import {
  listBranchRequests,
  approveBranchRequest,
  dismissBranchRequest,
  type BranchRequestAdmin,
} from "@/lib/actions/branchRequest";
import { refreshOrganizations } from "@/lib/data/superadmin";
import { contractAmount, billingCycleLabel } from "@/lib/contract";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export const PedidosSucursalPanel = ({
  onAbrir,
}: {
  onAbrir?: (orgId: string) => void;
}) => {
  const toast = useToast();
  const [items, setItems] = useState<BranchRequestAdmin[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(await listBranchRequests());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (items.length === 0) return null;

  const aprobar = async (id: string) => {
    setBusy(id);
    try {
      const r = await approveBranchRequest(id);
      if (!r.ok) {
        toast(r.error, "error");
        return;
      }
      await load();
      await refreshOrganizations();
      toast("Cupo actualizado · podés agregar la sucursal", "success");
      if (r.organizationId && onAbrir) onAbrir(r.organizationId);
    } finally {
      setBusy(null);
    }
  };

  const descartar = async (id: string) => {
    setBusy(id);
    await dismissBranchRequest(id);
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
          const monto = contractAmount(
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
                  {money.format(monto)} / {billingCycleLabel(p.orgPlan)}
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
                      <Spinner className="size-3.5 border-crema border-r-transparent" inline />
                      Aprobando…
                    </>
                  ) : (
                    "Aprobar (pago OK)"
                  )}
                </button>
                {onAbrir && (
                  <button
                    type="button"
                    onClick={() => onAbrir(p.organizationId)}
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

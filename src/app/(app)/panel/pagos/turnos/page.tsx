"use client";

import { useMemo } from "react";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore } from "@/lib/store/session-store";
import { useConfigStore } from "@/lib/store/config-store";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { useActiveEmployee } from "@/lib/hooks/useActiveEmployee";
import { useFloorShift } from "@/lib/hooks/useFloorShift";
import { useTableBills } from "@/lib/hooks/useTableBills";
import { SubPageHeader } from "@/components/panel/SubPageHeader";
import { JornadaBoard } from "@/components/panel/mesas/JornadaBoard";
import { MascotLoader } from "@/components/ui/MascotLoader";

/* Quién atiende cada mesa.
 *
 * Era una pestaña al lado de Comandas y Cobrar, y no pertenecía: esas tres son
 * el trabajo del servicio y esto se arma una vez, antes de abrir. Como pestaña
 * obligaba además a preguntar `tab === "turno"` en media pantalla operativa
 * para apagarle el buscador, el filtro y el detalle.
 *
 * El tablero es el mismo de siempre; lo único que cambió es que ahora tiene su
 * propia pantalla y su propio volver. */
const TurnosPage = () => {
  const { t } = useApp();
  const branchId = useSessionStore((s) => s.sucursalId);
  const { visibles, canManage, ready } = useOperationalAccess();
  const employees = useConfigStore((s) => s.employees);
  const tableCount = useConfigStore((s) => s.tableCount);
  const employee = useActiveEmployee();
  const { shift, live, refresh } = useFloorShift(
    visibles.pagos ? branchId : null,
    visibles.pagos,
  );
  const { bills } = useTableBills(visibles.pagos ? branchId : null);

  /* Las que están ocupadas ahora, para que el tablero no asigne sobre una mesa
   * con gente sentada. Mismo criterio que la pantalla operativa. */
  const occupied = useMemo(
    () =>
      new Set(
        bills
          .filter((b) => b.session.status === "abierta")
          .map((b) => b.session.tableNumber),
      ),
    [bills],
  );

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }
  if (!visibles.pagos) return null;

  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader
        volverA="/panel/pagos"
        volverLabel={t("nav.pagos")}
        titulo={t("mesas.filtroTurno")}
        sub={t("mesas.turnosSub")}
      />
      <JornadaBoard
        branchId={branchId}
        shift={shift}
        live={live}
        tableCount={tableCount}
        occupied={occupied}
        employees={employees}
        canManage={canManage}
        actorId={employee?.id ?? null}
        onChanged={refresh}
      />
    </div>
  );
};

export default TurnosPage;

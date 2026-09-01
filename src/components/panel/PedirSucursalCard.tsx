"use client";

import { useSessionStore } from "@/lib/store/session-store";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { useApp } from "@/components/providers/Providers";
import { Spinner } from "@/components/ui/Spinner";
import {
  getQuotaSummary,
  requestExtraBranch,
  type QuotaSummary,
} from "@/lib/actions/branchRequest";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 placeholder:text-carbon/40";

export const PedirSucursalCard = () => {
  const { t } = useApp();
  const toast = useToast();
  const rol = useSessionStore((s) => s.rol);
  const esDueno = rol === "admin" || rol === "superadmin";
  const [resumen, setResumen] = useState<QuotaSummary | null | undefined>(
    undefined,
  );
  const [abierto, setAbierto] = useState(false);
  const [name, setNombre] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setResumen(await getQuotaSummary());
  }, []);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- `load` hace
       el setState después de un await, no acá; la regla no lo distingue. */
    void load();
  }, [load]);

  if (!esDueno) return null;

  if (resumen === undefined) {
    return (
      <section className="rounded-[24px] border border-linea bg-surface p-4 shadow-sm sm:p-6">
        <p className="text-sm text-carbon/45">Cargando sucursales…</p>
      </section>
    );
  }
  if (!resumen) return null;

  const puedePedir =
    resumen.activo && resumen.plan !== "gratis" && !resumen.pendiente;

  const enviar = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await requestExtraBranch({
        nombreSucursal: name,
        confirmar,
      });
      if (!r.ok) {
        toast(r.error, "error");
        return;
      }
      toast("Pedido enviado · revisá el mail con el alias de pago", "success");
      setAbierto(false);
      setNombre("");
      setConfirmar(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[24px] border border-linea bg-surface p-4 shadow-sm sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-carbon/60">
        Sucursales contratadas
      </h2>
      <p className="mt-2 text-sm text-carbon/70">
        Tenés <b>{resumen.usadas}</b>{" "}
        {resumen.usadas === 1 ? "sucursal" : "sucursales"}.
      </p>

      {resumen.pendiente && (
        <p className="mt-3 rounded-xl border border-amber-300/80 bg-amber-100 px-3 py-2 text-xs font-medium text-amber-950">
          Pedido en curso: te mandamos el mail con el alias. Cuando veamos la
          transferencia, la damos de alta.
        </p>
      )}

      {!resumen.activo && (
        <p className="mt-3 text-xs text-carbon/55">
          La cuenta está pausada. No se pueden pedir sucursales ahora.
        </p>
      )}

      {resumen.plan === "gratis" && (
        <p className="mt-3 text-xs text-carbon/55">
          En plan cortesía no se suman sucursales. Escribinos a{" "}
          <a
            href="mailto:info@cicalino.net"
            className="font-semibold text-marca hover:underline"
          >
            info@cicalino.net
          </a>
          .
        </p>
      )}

      {puedePedir && !abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="mt-4 w-full rounded-full bg-marca px-4 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte sm:w-auto"
        >
          Pedir otra sucursal
        </button>
      )}

      {puedePedir && abierto && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-linea bg-crema/40 p-4">
          <p className="text-sm leading-snug text-carbon/75">
            Sumás <b>1 sucursal</b>. Transferís{" "}
            <b>{money.format(resumen.montoExtra)}</b> ({resumen.ciclo}) al alias{" "}
            <b className="text-marca">{resumen.alias}</b>. Cuando veamos el pago,
            la habilitamos.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-carbon/70">
              Nombre de la nueva (opcional)
            </span>
            <input
              className={INPUT}
              value={name}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="ej. Norte, Centro 2"
              maxLength={80}
            />
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={confirmar}
              onChange={(e) => setConfirmar(e.target.checked)}
              className="mt-1 size-4 accent-[var(--brand)]"
            />
            <span className="text-sm leading-snug text-carbon/75">
              Confirmo que quiero contratar otra sucursal y acepto las{" "}
              <Link
                href="/terms"
                target="_blank"
                className="font-semibold text-marca underline-offset-2 hover:underline"
              >
                bases y condiciones
              </Link>
              .
            </span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                setConfirmar(false);
              }}
              disabled={busy}
              className="w-full rounded-full border border-linea px-4 py-3 text-sm font-semibold text-carbon transition hover:bg-carbon/5 disabled:opacity-50 sm:flex-1"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={busy || !confirmar}
              className="inline-flex w-full items-center justify-center rounded-full bg-marca px-4 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte disabled:opacity-50 sm:flex-1"
            >
              {busy ? (
                <>
                  <Spinner className="mr-2 size-4 border-crema border-r-transparent" inline />
                  Enviando…
                </>
              ) : (
                t("config.pedirSucursalCta")
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

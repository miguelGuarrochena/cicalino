"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { fetchTableHistory, type TableEventView } from "@/lib/data/tables";
import { formatMoney } from "@/lib/tableBill";

/* "Juan confirmó el pago de Mesa 8 — 20:42". Loaded on demand: it's for
 * checking what happened, not something to watch during service. */
export const TableHistory = ({ sessionId, version }: { sessionId: string; version: number }) => {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<TableEventView[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);

  const load = async () => {
    const res = await fetchTableHistory(sessionId);
    setEvents(res.ok ? res.data : []);
    setLoadedFor(version);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && loadedFor !== version) void load();
  };

  const describe = (e: TableEventView) => {
    const who =
      e.who ??
      (e.actor === "mercado_pago"
        ? "Mercado Pago"
        : e.actor === "sistema"
          ? t("mesas.evento.sistema")
          : t("mesas.evento.alguien"));
    const key = `mesas.evento.${e.type}`;
    const text = t(key, {
      quien: who,
      monto: e.amount != null ? formatMoney(e.amount) : "",
      metodo: e.method ? t(`mesa.metodo.${e.method}`) : "",
    });
    return text === key ? `${who} · ${e.type}` : text;
  };

  return (
    <section className="border-t border-linea pt-3 print:hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="text-xs font-semibold text-carbon/60 underline"
      >
        {open ? t("mesas.ocultarHistorial") : t("mesas.verHistorial")}
      </button>
      {open && (
        <ol className="mt-2 flex flex-col gap-1.5 text-xs text-carbon/70">
          {events === null && <li>…</li>}
          {events?.length === 0 && <li>{t("mesas.sinHistorial")}</li>}
          {events?.map((e) => (
            <li key={e.id} className="flex gap-2">
              <span className="shrink-0 tabular-nums text-carbon/45">
                {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span>{describe(e)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

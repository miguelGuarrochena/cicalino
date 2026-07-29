"use client";

import { useEffect, useMemo, useState } from "react";
import { ModuleSwitcher } from "@/components/panel/ModuleSwitcher";
import { QrModal } from "@/components/panel/QrModal";
import { ModalShell } from "@/components/ui/ModalShell";
import { Pagination, slicePage } from "@/components/ui/Pagination";
import { useApp } from "@/components/providers/Providers";
import { useEsperas } from "@/lib/hooks/useEsperas";
import { useConfigStore } from "@/lib/store/config-store";
import { useSessionStore } from "@/lib/store/session-store";
import { useToast } from "@/components/ui/Toast";
import { ETIQUETA_ESPERA, esperaClosed, type EsperaView } from "@/lib/types";
import {
  leerDispositivoModo,
  modulosVisibles,
} from "@/lib/modulos";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

const PAGE_SIZE = 8;
const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none transition focus:border-espera focus:ring-2 focus:ring-espera/20 placeholder:text-carbon/40";

const minsAgo = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));

const EsperaPanelPage = () => {
  const { t, locale } = useApp();
  const toast = useToast();
  const router = useRouter();
  const branchId = useSessionStore((s) => s.sucursalId);
  const activeEmployee = useSessionStore((s) => s.empleadoActivo);
  const cantidadMesas = useConfigStore((s) => s.cantidadMesas);
  const moduloPedidos = useConfigStore((s) => s.moduloPedidos);
  const moduloEspera = useConfigStore((s) => s.moduloEspera);
  const dispositivo = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    leerDispositivoModo,
    () => "ambos" as const,
  );
  const visibles = modulosVisibles(
    { pedidos: moduloPedidos, espera: moduloEspera },
    dispositivo,
  );

  const {
    esperas,
    mesas,
    crearEspera,
    avisar,
    sentar,
    cancelar,
    liberarMesa,
  } = useEsperas(branchId);

  const [qr, setQr] = useState<EsperaView | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [personas, setPersonas] = useState(2);
  const [creating, setCreating] = useState(false);
  const [sentarId, setSentarId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!visibles.espera && visibles.pedidos) router.replace("/panel");
  }, [visibles, router]);

  useEffect(() => {
    if (!qr) return;
    const fresh = esperas.find((e) => e.id === qr.id);
    if (fresh?.vistoEn) setQr(null);
  }, [esperas, qr]);

  const cola = useMemo(
    () =>
      esperas
        .filter((e) => e.estado === "esperando" || e.estado === "avisado")
        .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn)),
    [esperas],
  );
  const libres = mesas.filter((m) => m.estado === "libre").length;
  const ocupadas = mesas.filter((m) => m.estado === "ocupada").length;
  const paginated = slicePage(cola, page, PAGE_SIZE);
  const sentarEspera = esperas.find((e) => e.id === sentarId);
  const mesasLibres = mesas.filter((m) => m.estado === "libre");

  const onCrear = async () => {
    if (creating) return;
                if (!nombre.trim()) {
      toast(locale === "en" ? "Enter a name" : "Ingresá un nombre", "error");
      return;
    }
    setCreating(true);
    try {
      const created = await crearEspera(
        nombre,
        personas,
        activeEmployee
          ? { id: activeEmployee.id, nombre: activeEmployee.nombre }
          : null,
      );
      if (created) {
        setQr(created);
        setCreateOpen(false);
        setNombre("");
        setPersonas(2);
        toast(
          locale === "en" ? "Added to waitlist" : "En cola de espera",
          "success",
        );
      }
    } finally {
      setCreating(false);
    }
  };

  if (!visibles.espera) return null;

  return (
    <div>
      <ModuleSwitcher />

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-espera">
            {locale === "en" ? "Table wait" : "Espera de mesa"}
          </p>
          <h1 className="font-display text-2xl uppercase tracking-tight text-carbon sm:text-3xl">
            {locale === "en" ? "Floor & queue" : "Sala y cola"}
          </h1>
          <p className="mt-1 text-sm text-carbon/55">
            {libres} {locale === "en" ? "free" : "libres"} · {ocupadas}{" "}
            {locale === "en" ? "busy" : "ocupadas"} · {cola.length}{" "}
            {locale === "en" ? "waiting" : "en espera"}
            {cantidadMesas ? ` · ${cantidadMesas} mesas` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-full bg-espera px-5 py-2.5 text-sm font-semibold text-crema shadow-sm transition hover:bg-espera-fuerte"
        >
          {locale === "en" ? "+ Add party" : "+ Agregar grupo"}
        </button>
      </div>

      {/* Grid de mesas */}
      <section className="mb-6 rounded-[24px] border border-espera/20 bg-surface p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-carbon/70">
          {locale === "en" ? "Tables" : "Mesas"}
        </h2>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
          {mesas.map((m) => {
            const libre = m.estado === "libre";
            return (
              <button
                key={m.id}
                type="button"
                disabled={libre}
                onClick={() => {
                  if (!libre) void liberarMesa(m.numero);
                }}
                title={
                  libre
                    ? locale === "en"
                      ? "Free"
                      : "Libre"
                    : locale === "en"
                      ? "Tap to free"
                      : "Tocar para liberar"
                }
                className={`flex aspect-square flex-col items-center justify-center rounded-2xl border text-center transition ${
                  libre
                    ? "border-espera/30 bg-espera/10 text-espera"
                    : "border-carbon/15 bg-carbon/5 text-carbon/70 hover:border-espera/40 hover:bg-espera/5"
                }`}
              >
                <span className="font-display text-lg leading-none">{m.numero}</span>
                <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                  {libre
                    ? locale === "en"
                      ? "Free"
                      : "Libre"
                    : locale === "en"
                      ? "Busy"
                      : "Ocup."}
                </span>
              </button>
            );
          })}
          {!mesas.length && (
            <p className="col-span-full text-sm text-carbon/50">
              {locale === "en"
                ? "Set table count in Settings."
                : "Definí la cantidad de mesas en Configuración."}
            </p>
          )}
        </div>
      </section>

      {/* Cola */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-carbon/70">
          {locale === "en" ? "Waiting list" : "Cola de espera"}
        </h2>
        <div className="flex flex-col gap-3">
          {paginated.map((e) => (
            <article
              key={e.id}
              className={`rounded-[20px] border bg-surface p-4 shadow-sm ${
                e.estado === "avisado"
                  ? "border-espera/40 ring-1 ring-espera/20"
                  : "border-linea"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-xl uppercase tracking-tight text-carbon">
                      {e.nombre}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        e.estado === "avisado"
                          ? "bg-espera/15 text-espera"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {ETIQUETA_ESPERA[e.estado]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-carbon/55">
                    {e.personas} {locale === "en" ? "guests" : "personas"} ·{" "}
                    {minsAgo(e.creadoEn)} min
                    {e.empleado ? ` · ${e.empleado}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setQr(e)}
                    className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon/70 transition hover:bg-crema"
                  >
                    QR
                  </button>
                  {e.estado === "esperando" && (
                    <button
                      type="button"
                      onClick={() => void avisar(e.id)}
                      className="rounded-full bg-espera px-3 py-1.5 text-xs font-semibold text-crema transition hover:bg-espera-fuerte"
                    >
                      {locale === "en" ? "Notify" : "Avisar"}
                    </button>
                  )}
                  {(e.estado === "esperando" || e.estado === "avisado") && (
                    <button
                      type="button"
                      onClick={() => setSentarId(e.id)}
                      disabled={!mesasLibres.length}
                      className="rounded-full bg-carbon px-3 py-1.5 text-xs font-semibold text-crema transition hover:opacity-90 disabled:opacity-40"
                    >
                      {locale === "en" ? "Seat" : "Sentar"}
                    </button>
                  )}
                  {!esperaClosed(e.estado) && (
                    <button
                      type="button"
                      onClick={() => void cancelar(e.id)}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold text-red-600/80 transition hover:bg-red-50"
                    >
                      {locale === "en" ? "Cancel" : "Cancelar"}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
          {!cola.length && (
            <div className="rounded-[24px] border border-dashed border-espera/30 bg-espera/5 px-6 py-12 text-center">
              <p className="font-display text-lg uppercase text-espera">
                {locale === "en" ? "No one waiting" : "Nadie en espera"}
              </p>
              <p className="mt-1 text-sm text-carbon/50">
                {locale === "en"
                  ? "Add a party when guests arrive."
                  : "Agregá un grupo cuando lleguen clientes."}
              </p>
            </div>
          )}
        </div>
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={cola.length}
          onChange={setPage}
        />
      </section>

      {qr && (
        <QrModal
          referencia={qr.nombre}
          token={qr.qrToken}
          etiqueta={locale === "en" ? "Party" : "Grupo"}
          onClose={() => setQr(null)}
          pathPrefix="/e"
          accent="espera"
          onCancelar={() => {
            void cancelar(qr.id);
            setQr(null);
          }}
        />
      )}

      {createOpen && (
        <ModalShell
          onClose={() => {
            if (!creating) setCreateOpen(false);
          }}
          labelledBy="espera-crear-title"
        >
          <h2
            id="espera-crear-title"
            className="font-display text-xl uppercase tracking-tight text-carbon"
          >
            {locale === "en" ? "Add to waitlist" : "Agregar a la espera"}
          </h2>
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-carbon/70">
                {locale === "en" ? "Name" : "Nombre"}
              </span>
              <input
                className={INPUT}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="García"
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-carbon/70">
                {locale === "en" ? "Party size" : "Personas"}
              </span>
              <input
                type="number"
                min={1}
                max={50}
                className={INPUT}
                value={personas}
                onChange={(e) => setPersonas(Number(e.target.value) || 1)}
              />
            </label>
            <button
              type="button"
              disabled={creating}
              onClick={() => void onCrear()}
              className="mt-2 rounded-full bg-espera px-5 py-3 text-sm font-semibold text-crema transition hover:bg-espera-fuerte disabled:opacity-60"
            >
              {creating
                ? "…"
                : locale === "en"
                  ? "Create & show QR"
                  : "Crear y mostrar QR"}
            </button>
          </div>
        </ModalShell>
      )}

      {sentarId && (
        <ModalShell onClose={() => setSentarId(null)} labelledBy="sentar-title">
          <h2
            id="sentar-title"
            className="font-display text-xl uppercase tracking-tight text-carbon"
          >
            {locale === "en"
              ? `Seat ${sentarEspera?.nombre ?? ""}`
              : `Sentar a ${sentarEspera?.nombre ?? ""}`}
          </h2>
          <p className="mt-2 mb-3 text-sm text-carbon/55">
            {locale === "en" ? "Pick a free table" : "Elegí una mesa libre"}
          </p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {mesasLibres.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  if (!sentarId) return;
                  void sentar(sentarId, m.numero).then(() => {
                    setSentarId(null);
                    toast(
                      locale === "en"
                        ? `Seated at table ${m.numero}`
                        : `Sentados en mesa ${m.numero}`,
                      "success",
                    );
                  });
                }}
                className="flex aspect-square items-center justify-center rounded-2xl border border-espera/30 bg-espera/10 font-display text-xl text-espera transition hover:bg-espera hover:text-crema"
              >
                {m.numero}
              </button>
            ))}
          </div>
        </ModalShell>
      )}
    </div>
  );
};

export default EsperaPanelPage;

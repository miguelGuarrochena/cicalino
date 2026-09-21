"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { useConfirm } from "@/components/ui/Confirm";
import { Controls } from "@/components/ui/Controls";
import { TabGlyph } from "@/components/ui/TabGlyph";
import { Spinner } from "@/components/ui/Spinner";
import { CustomerBrandHeader } from "@/components/customer/CustomerBrandHeader";
import { CustomerBrandShell } from "@/components/customer/CustomerBrandShell";
import { CustomerNotice } from "@/components/customer/CustomerNotice";
import type { BrandColorId } from "@/lib/customerBrand";
import {
  PaymentRows,
} from "@/components/tables/BillParts";
import { MenuBrowser } from "@/components/customer/table/MenuBrowser";
import { OrderReview } from "@/components/customer/table/OrderReview";
import { SentOrders } from "@/components/customer/table/SentOrders";
import { TableBottomBar } from "@/components/customer/table/TableBottomBar";
import { PayScreen } from "@/components/customer/table/PayScreen";
import { TransferDetails, useErrorText } from "@/components/customer/table/TransferDetails";
import { guestNameSchema } from "@/lib/schemas";
import { clearGuestCred, loadGuestCred, saveGuestCred } from "@/lib/guestSession";
import {
  billRequested,
  formatMoney,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";
import { useTableBillLive } from "@/lib/hooks/useTableBillLive";
import { ModalShell } from "@/components/ui/ModalShell";
import {
  clampCantidad,
  itemsCarrito,
  itemsParaEnviar,
  lineasDelCarrito,
  totalCarrito,
  type CartLine,
} from "@/lib/cart";

export interface GuestMenuProduct {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  imageUrl?: string | null;
}

export interface TableGuestInitial {
  token: string;
  tableNumber: number;
  branchName: string;
  logoUrl: string | null;
  colorMarca: BrandColorId | null;
  operational: boolean;
  menu: GuestMenuProduct[];
  settings: PaymentSettings;
  mercadoPagoReady: boolean;
  guest: { id: string; name: string } | null;
  bill: TableBill | null;
  returningPaymentId: string | null;
}

type Tab = "carta" | "pedidos" | "cuenta";

const POLL_VISIBLE_MS = 5_000;

const newKey = () => crypto.randomUUID();

export const TableGuestApp = ({ initial }: { initial: TableGuestInitial }) => {
  const { t } = useApp();
  const confirmar = useConfirm();
  const router = useRouter();
  const { token } = initial;

  const [guest, setGuest] = useState(initial.guest);
  const [bill, setBill] = useState<TableBill | null>(initial.bill);
      const [tab, setTab] = useState<Tab>(
        initial.returningPaymentId || (initial.bill && initial.bill.totals.consumption > 0)
          ? "cuenta"
          : "carta",
      );
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orderKey, setOrderKey] = useState(newKey);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* El error de mandar el pedido va aparte del de la pantalla.
   *
   * Compartían estado, y eso hacía dos cosas raras. Un fallo al llamar al mozo
   * aparecía después en el pie de la revisión, arriba de "Enviar pedido", como
   * si hubiera fallado el envío — cuando no se había mandado nada. Y al revés:
   * un error de envío se dibujaba dos veces, en la hoja y en la página de
   * atrás, y al cerrar la hoja el cartel viejo seguía ahí. */
  const [orderError, setOrderError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  /* Lo que acaba de salir. El carrito se vacía en cuanto el servidor confirma,
   * así que sin esta copia la hoja de "pedido enviado" quedaría en blanco. */
  const [enviado, setEnviado] = useState<CartLine[] | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(initial.returningPaymentId);
  const [pagoTotalAviso, setPagoTotalAviso] = useState<string | null>(null);
  const applyBill = useCallback((next: TableBill | null) => {
    if (next) setBill(next);
  }, []);
  const handleJoined = useCallback(
    (g: { id: string; name: string }, b: TableBill) => {
      setGuest(g);
      applyBill(b);
    },
    [applyBill],
  );

  /* Polling with the tab visible; one refresh when it comes back. Nothing is
   * kept only in memory, so a reload or a dropped connection resumes from the
   * server state. */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/m/${token}/cuenta`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; reason?: string; tableToken?: string; bill?: TableBill; guest?: { id: string; name: string } }
        | null;
      if (!data) return;
      if (data.ok && data.bill) {
        applyBill(data.bill);
        if (data.guest) setGuest(data.guest);
      } else if (data.reason === "otra-mesa" && data.tableToken) {
        router.replace(`/m/${data.tableToken}`);
      } else if (data.reason === "no-guest" || data.reason === "comensal-invalido") {
        setGuest(null);
        setBill(null);
      }
    } catch {
      /* Offline for a moment: the next tick tries again. */
    }
  }, [token, router, applyBill]);

  useEffect(() => {
    if (!guest) return;
    let id: number | undefined;
    const tick = () => {
      window.clearInterval(id);
      if (document.visibilityState === "visible") {
        void refresh();
        id = window.setInterval(() => void refresh(), POLL_VISIBLE_MS);
      }
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }, [guest, refresh]);

  useTableBillLive(bill?.session.id ?? null, refresh);

  useEffect(() => {
    if (!guest || !bill?.session.requestedAt || !bill.session.fullPayerId) return;
    if (bill.session.fullPayerId === guest.id) return;
    const storageKey = `cicalino-pago-total:${bill.session.id}:${bill.session.requestedAt}`;
    try {
      if (sessionStorage.getItem(storageKey)) return;
    } catch {
      /* Safari private mode. */
    }
    setPagoTotalAviso(bill.session.fullPayerName || t("mesa.alguienDeLaMesa"));
    setTab("cuenta");
  }, [guest, bill, t]);

  /* Back from the Mercado Pago checkout: we only show what the webhook
   * confirmed, so this waits for the payment to leave "pendiente". */
  const returning = checkingPayment
    ? bill?.payments.find((p) => p.id === checkingPayment) ?? null
    : null;
  useEffect(() => {
    if (!checkingPayment || !returning || returning.status === "pendiente") return;
    setNotice(
      returning.status === "pagado" ? t("mesa.mpAprobado") : t("mesa.mpNoAprobado"),
    );
    setCheckingPayment(null);
    router.replace(`/m/${token}`);
  }, [checkingPayment, returning, router, token, t]);

  const products = useMemo(
    () => new Map(initial.menu.map((p) => [p.id, p])),
    [initial.menu],
  );
  const cartLines = useMemo(() => lineasDelCarrito(cart, products), [cart, products]);
  const cartTotal = totalCarrito(cartLines);
  const cartCount = itemsCarrito(cartLines);

  const errorText = useErrorText();

  /* Cuánto ocupa la barra de pestañas, que queda pegada arriba. La carta lo
   * necesita para pegar su propia barra justo abajo y para saber a qué altura
   * frenar el salto a una categoría. Se mide en vez de escribirse: el alto
   * cambia con el idioma, con el tamaño de letra del sistema y con el
   * teléfono. */
  const navRef = useRef<HTMLElement>(null);
  const [navAlto, setNavAlto] = useState(0);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const medir = () => setNavAlto(el.offsetHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* A changed cart is a different order, so it gets a new idempotency key. */
  const setQty = (id: string, q: number) => {
    setCart((c) => ({ ...c, [id]: clampCantidad(q) }));
    setOrderKey(newKey());
    /* Corregir una cantidad después de un error es un intento nuevo: el
     * cartel viejo no tiene por qué seguir ahí. */
    setOrderError(null);
  };

  const sendOrder = async () => {
    if (sending || !cartLines.length) return;
    setSending(true);
    setOrderError(null);
    try {
      const res = await fetch(`/api/m/${token}/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: orderKey,
          items: itemsParaEnviar(cartLines),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; reason?: string; bill?: TableBill }
        | null;
      if (!data?.ok) {
        setOrderError(errorText(data?.reason));
        return;
      }
      applyBill(data.bill ?? null);
      /* La copia se guarda ANTES de vaciar: la hoja de confirmación muestra lo
       * que se mandó, y para entonces el carrito ya no existe. */
      setEnviado(cartLines);
      setCart({});
      /* New key only after success: a retry of the same cart after a network
       * error reuses the old key and can't create a duplicate order. */
      setOrderKey(newKey());
    } catch {
      setOrderError(t("mesa.error.red"));
    } finally {
      setSending(false);
    }
  };

  const cancelOrder = async (orderId: string) => {
    if (sending) return;
    const ok = await confirmar({
      title: t("mesa.cancelarPedidoTitulo"),
      body: t("mesa.cancelarPedidoConfirmar"),
      confirmLabel: t("mesa.cancelarPedidoSi"),
      cancelLabel: t("acciones.volver"),
      tone: "peligro",
    });
    if (!ok) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/m/${token}/pedidos/${orderId}/cancelar`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; reason?: string; bill?: TableBill }
        | null;
      if (!data?.ok) {
        setError(errorText(data?.reason));
        return;
      }
      applyBill(data.bill ?? null);
      setNotice(t("mesa.pedidoCancelado"));
    } catch {
      setError(t("mesa.error.red"));
    } finally {
      setSending(false);
    }
  };

  const callStaff = async () => {
    if (sending || bill?.session.calledAt) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/m/${token}/llamar`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; reason?: string; bill?: TableBill }
        | null;
      if (!data?.ok) {
        setError(errorText(data?.reason));
        return;
      }
      applyBill(data.bill ?? null);
      setNotice(t("mesa.llamadoEnviado"));
    } catch {
      setError(t("mesa.error.red"));
    } finally {
      setSending(false);
    }
  };

  if (!guest || !bill) {
    return (
      <CustomerBrandShell color={initial.colorMarca}>
        <JoinTable
          token={token}
          tableNumber={initial.tableNumber}
          branchName={initial.branchName}
          logoUrl={initial.logoUrl}
          operational={initial.operational}
          onJoined={handleJoined}
        />
      </CustomerBrandShell>
    );
  }

  const open = bill.session.status === "abierta";
  const puedePedir = open && !billRequested(bill);
  const myOrders = bill.orders.filter((o) => o.guestId === guest.id);
  const unpaid = open && bill.totals.available > 0 && !billRequested(bill);
  const hasConsumption = bill.totals.consumption > 0;
  const cuentaFlujo = tab === "cuenta" && hasConsumption && open;
  const showBar = !cuentaFlujo && (cartCount > 0 || hasConsumption || tab === "cuenta");

  return (
    <CustomerBrandShell color={initial.colorMarca}>
    {/* El hueco de abajo es para la barra fija. Mientras se paga, esa barra no
        está —la pantalla de pago trae la suya— y el hueco quedaba como 300 px
        de vacío al final. */}
    <main className={`mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pt-4 ${showBar ? "pb-32" : "pb-8"}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CustomerBrandHeader
            name={initial.branchName}
            logoUrl={initial.logoUrl}
            align="start"
          />
          <h1 className="font-display text-3xl uppercase text-marca">
            {t("mesa.mesaN", { n: bill.session.tableNumber })}
          </h1>
          <p className="mt-0.5 text-base text-suave">{t("mesa.hola", { n: guest.name })}</p>
        </div>
        <Controls showTheme={false} />
      </header>

        {open && (
          <button
            type="button"
            disabled={sending || Boolean(bill.session.calledAt)}
            onClick={() => void callStaff()}
            className="mt-4 min-h-12 w-full rounded-full border-2 border-marca px-4 text-base font-semibold text-marca disabled:opacity-60"
          >
            {bill.session.calledAt ? t("mesa.llamandoMozo") : t("mesa.llamarMozo")}
          </button>
        )}

        {!open && (
          <CustomerNotice tone="ok" className="mt-4">
            <p className="font-semibold">
              {bill.session.status === "pagada" ? t("mesa.mesaPagada") : t("mesa.mesaCerrada")}
            </p>
            <button
              type="button"
              onClick={() => {
                setGuest(null);
                setBill(null);
              }}
              className="mt-2.5 inline-flex min-h-11 items-center rounded-full border-2 border-marca px-4 text-base font-semibold text-marca"
            >
              {t("mesa.nuevaVisita")}
            </button>
          </CustomerNotice>
        )}

        {notice && (
          <CustomerNotice
            tone="marca"
            className="mt-4"
            onClose={() => setNotice(null)}
            closeLabel={t("mesa.cerrarAviso")}
          >
            {notice}
          </CustomerNotice>
        )}
        {checkingPayment && (
          <CustomerNotice tone="curso" className="mt-4">
            <span className="flex items-center gap-2">
              <Spinner inline className="size-4" /> {t("mesa.mpVerificando")}
            </span>
          </CustomerNotice>
        )}
        {error && (
          <CustomerNotice
            tone="alerta"
            role="alert"
            className="mt-4"
            onClose={() => setError(null)}
            closeLabel={t("mesa.cerrarAviso")}
          >
            {error}
          </CustomerNotice>
        )}

        <nav
          ref={navRef}
          role="tablist"
          aria-label={t("mesa.secciones")}
          className="sticky top-0 z-20 -mx-4 mt-4 grid grid-cols-3 gap-2 border-b border-linea bg-crema/90 px-4 py-2 backdrop-blur"
        >
          {(["carta", "pedidos", "cuenta"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              type="button"
              onClick={() => {
              setTab(k);
              /* Los avisos pertenecen a la acción que los produjo. "Pedido
               * cancelado" no tiene nada que decir en Cuenta, y se quedaba
               * ahí el resto de la noche. */
              setNotice(null);
              setError(null);
              setOrderError(null);
            }}
              className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1 py-2 text-sm font-semibold transition ${
                tab === k
                  ? "border-marca bg-marca text-crema"
                  : "border-linea bg-surface text-suave hover:text-carbon"
              }`}
            >
              <TabGlyph k={k === "pedidos" ? "pedido" : k} size={26} />
              {t(`mesa.tab.${k}`)}
            </button>
          ))}
        </nav>

        {tab === "carta" && (
          <MenuBrowser
            menu={initial.menu}
            cart={cart}
            puedePedir={puedePedir}
            onCantidad={setQty}
            stickyTop={navAlto}
          />
        )}

        {tab === "pedidos" && (
          <SentOrders
            pedidos={myOrders}
            itemsSinEnviar={cartCount}
            mesaAbierta={open}
            ocupado={sending}
            onVerPedido={() => setReviewOpen(true)}
            onCancelar={(id) => void cancelOrder(id)}
          />
        )}

        {tab === "cuenta" && hasConsumption && open ? (
          <PayScreen
            token={token}
            bill={bill}
            guestId={guest.id}
            settings={initial.settings}
            mercadoPagoReady={initial.mercadoPagoReady}
            onBill={applyBill}
            onStale={() => void refresh()}
          />
        ) : tab === "cuenta" ? (
          <section className="mt-4 flex flex-col gap-5">
            <div>
              <h2 className="mb-3 font-display text-xl uppercase tracking-tight text-carbon">
                {t("mesa.seccionPagos")}
              </h2>
              <PaymentRows
                bill={bill}
                highlightGuestId={guest.id}
                actions={(p) =>
                  p.guestId === guest.id && p.status === "pendiente" ? (
                    <PendingPaymentHelp
                      token={token}
                      paymentId={p.id}
                      method={p.method}
                      total={p.total}
                      settings={initial.settings}
                      requested={billRequested(bill)}
                      onChanged={applyBill}
                    />
                  ) : null
                }
              />
            </div>
          </section>
        ) : null}

      {showBar && (
        <TableBottomBar
          tab={tab}
          items={cartCount}
          total={cartTotal}
          hayConsumo={hasConsumption}
          faltaPagar={unpaid}
          onVerPedido={() => setReviewOpen(true)}
          onVerCuenta={() => setTab("cuenta")}
          onVerCarta={() => setTab("carta")}
          onPagar={() => setTab("cuenta")}
        />
      )}

      {(reviewOpen || enviado) && (
        <OrderReview
          lineas={cartLines}
          enviando={sending}
          error={orderError}
          enviado={enviado}
          puedePedir={puedePedir}
          onCantidad={setQty}
          onEnviar={() => void sendOrder()}
          onSeguirPidiendo={() => {
            setReviewOpen(false);
            setEnviado(null);
            setOrderError(null);
            setTab("carta");
          }}
          onVerPedidos={() => {
            setReviewOpen(false);
            setEnviado(null);
            setOrderError(null);
            setTab("pedidos");
          }}
          onClose={() => {
            setReviewOpen(false);
            setEnviado(null);
            setOrderError(null);
          }}
        />
      )}

      {pagoTotalAviso && (
        <ModalShell
          labelledBy="pago-total-titulo"
          onClose={() => {
            if (bill?.session.requestedAt) {
              try {
                sessionStorage.setItem(
                  `cicalino-pago-total:${bill.session.id}:${bill.session.requestedAt}`,
                  "1",
                );
              } catch {
                /* ignore */
              }
            }
            setPagoTotalAviso(null);
            setTab("cuenta");
          }}
          footer={
            <button
              type="button"
              onClick={() => {
                if (bill?.session.requestedAt) {
                  try {
                    sessionStorage.setItem(
                      `cicalino-pago-total:${bill.session.id}:${bill.session.requestedAt}`,
                      "1",
                    );
                  } catch {
                    /* ignore */
                  }
                }
                setPagoTotalAviso(null);
                setTab("cuenta");
              }}
              className="min-h-12 w-full rounded-full bg-marca px-5 text-base font-semibold text-crema"
            >
              {t("mesa.entendido")}
            </button>
          }
        >
          <h2 id="pago-total-titulo" className="font-display text-2xl uppercase text-marca">
            {t("mesa.pagoTotalPopupTitulo", { n: pagoTotalAviso })}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-carbon">{t("mesa.pagoTotalPopupCuerpo")}</p>
        </ModalShell>
      )}


    </main>
    </CustomerBrandShell>
  );
};

const JoinTable = ({
  token,
  tableNumber,
  branchName,
  logoUrl,
  operational,
  onJoined,
}: {
  token: string;
  tableNumber: number;
  branchName: string;
  logoUrl: string | null;
  operational: boolean;
  onJoined: (g: { id: string; name: string }, b: TableBill) => void;
}) => {
  const { t } = useApp();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const errorText = useErrorText();

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const cred = loadGuestCred(token);
      if (!cred) return;
      try {
        const res = await fetch(`/api/m/${token}/restaurar`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cred }),
        });
        const data = (await res.json().catch(() => null)) as
          | { ok: boolean; guest?: { id: string; name: string }; bill?: TableBill }
          | null;
        if (cancelled) return;
        if (data?.ok && data.guest && data.bill) {
          onJoined(data.guest, data.bill);
          return;
        }
        clearGuestCred(token);
      } catch {
        /* Offline: keep creds so the next scan can restore. */
      }
    };
    void restore().finally(() => {
      if (!cancelled) setRestoring(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, onJoined]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || restoring) return;
    const parsed = guestNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("mesa.error.nombre-invalido"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/m/${token}/unirse`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parsed.data }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            ok: boolean;
            reason?: string;
            message?: string;
            guest?: { id: string; name: string };
            bill?: TableBill;
            cred?: string;
          }
        | null;
      if (!data?.ok || !data.guest || !data.bill) {
        setError(data?.message ?? errorText(data?.reason));
        return;
      }
      if (typeof data.cred === "string") saveGuestCred(token, data.cred);
      onJoined(data.guest, data.bill);
    } catch {
      setError(t("mesa.error.red"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <Controls showTheme={false} className="absolute right-4 top-4" />
      <CustomerBrandHeader name={branchName} logoUrl={logoUrl} align="start" />
      <h1 className="mt-1 font-display text-4xl uppercase text-marca">
        {t("mesa.mesaN", { n: tableNumber })}
      </h1>
      {restoring ? (
        <div className="mt-8 flex justify-center" aria-busy="true">
          <Spinner inline className="size-6" />
        </div>
      ) : operational ? (
        <form onSubmit={(e) => void join(e)} className="mt-8 flex flex-col gap-3">
          <label className="flex flex-col gap-2">
            <span className="text-lg font-semibold text-carbon">{t("mesa.tuNombre")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
              maxLength={24}
              autoFocus
              className="min-h-14 w-full rounded-2xl border-2 border-linea bg-surface px-4 text-lg text-carbon outline-none placeholder:text-suave focus:border-marca focus:ring-2 focus:ring-marca/20"
              placeholder={t("mesa.nombrePlaceholder")}
            />
          </label>
          <p className="text-sm leading-relaxed text-suave">{t("mesa.nombreAyuda")}</p>
          {/* Era `text-red-600` suelto sobre el fondo del local: 1.04:1 en
              verde, 1.07 en terracota. Justo el mensaje que hay que leer para
              poder seguir. */}
          {error && (
            <CustomerNotice tone="alerta" role="alert">
              {error}
            </CustomerNotice>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-2 flex min-h-14 items-center justify-center gap-2 rounded-full bg-marca px-6 text-base font-semibold text-crema disabled:opacity-50"
          >
            {busy && <Spinner inline className="size-4" />}
            {t("mesa.entrar")}
          </button>
        </form>
      ) : (
        <p className="mt-6 text-base leading-relaxed text-suave">{t("mesa.noDisponible")}</p>
      )}
    </main>
  );
};

/* Under a guest's own pending payment: what to do next, and a way out. */
const PendingPaymentHelp = ({
  token,
  paymentId,
  method,
  total,
  settings,
  requested = false,
  onChanged,
}: {
  token: string;
  paymentId: string;
  method: string;
  total: number;
  settings: PaymentSettings;
  requested?: boolean;
  onChanged: (b: TableBill | null) => void;
}) => {
  const { t } = useApp();
  const confirmar = useConfirm();
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    if (busy || requested) return;
    const ok = await confirmar({
      title: t("mesa.cancelarPagoTitulo"),
      body: t("mesa.cancelarPagoConfirmar"),
      confirmLabel: t("mesa.cancelarPagoSi"),
      cancelLabel: t("acciones.volver"),
      tone: "peligro",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/m/${token}/pagos/${paymentId}/cancelar`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { ok: boolean; bill?: TableBill } | null;
      if (data?.ok) onChanged(data.bill ?? null);
    } finally {
      setBusy(false);
    }
  };

  const checkout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/m/${token}/pagos/${paymentId}/checkout`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; checkoutUrl?: string }
        | null;
      if (data?.ok && data.checkoutUrl) window.location.assign(data.checkoutUrl);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2.5 rounded-xl bg-crema/60 p-3 text-sm text-carbon">
      {method === "transferencia" ? (
        <TransferDetails settings={settings} total={total} compact />
      ) : method === "mercado_pago" ? (
        <p>{t("mesa.mpPendienteAyuda")}</p>
      ) : (
        <p>{t("mesa.manualPendienteAyuda")}</p>
      )}
      {method === "mercado_pago" && requested && (
        <button
          type="button"
          onClick={() => void checkout()}
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
        >
          {t("mesa.pagarConMp", { n: formatMoney(total) })}
        </button>
      )}
      {!requested && (
        <button
          type="button"
          onClick={() => void cancel()}
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-full border border-linea px-4 text-sm font-semibold text-carbon disabled:opacity-50"
        >
          {t("mesa.cancelarPago")}
        </button>
      )}
    </div>
  );
};

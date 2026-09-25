"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { useConfirm } from "@/components/ui/Confirm";
import { Controls } from "@/components/ui/Controls";
import { TabGlyph } from "@/components/ui/TabGlyph";
import { Spinner } from "@/components/ui/Spinner";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { CustomerBrandHeader } from "@/components/customer/CustomerBrandHeader";
import { CustomerBrandShell } from "@/components/customer/CustomerBrandShell";
import { CustomerNotice } from "@/components/customer/CustomerNotice";
import { CustomerEmpty } from "@/components/customer/CustomerEmpty";
import { MenuBrowser } from "@/components/customer/table/MenuBrowser";
import { OrderReview } from "@/components/customer/table/OrderReview";
import { PickupOrderCard } from "@/components/customer/table/PickupOrderCard";
import { useErrorText } from "@/components/customer/table/TransferDetails";
import type { GuestMenuProduct } from "@/components/customer/table/TableGuestApp";
import type { BrandColorId } from "@/lib/customerBrand";
import { customerAliasSchema, guestNameSchema } from "@/lib/schemas";
import { clearGuestCred, loadGuestCred, saveGuestCred } from "@/lib/guestSession";
import { formatMoney } from "@/lib/tableBill";
import {
  clampCantidad,
  itemsCarrito,
  itemsParaEnviar,
  lineasDelCarrito,
  totalCarrito,
} from "@/lib/cart";
import {
  counterPayState,
  newlyReady,
  pickupActive,
  pickupStage,
  type PickupFlow,
  type PickupPayChoice,
  type PickupState,
} from "@/lib/tablePickup";
import { alertCustomerReady, unlockAudio } from "@/lib/sound";
import {
  canOfferWebPush,
  notificationPermissionGranted,
  requestNotificationPermission,
  showReadyNotice,
  subscribeWebPush,
  webPushAvailable,
} from "@/lib/notifications";
import type { OrderStatus } from "@/lib/types";

/* Pedidos desde un QR, en el teléfono del cliente. Dos modalidades:
 *
 *  autoservicio  (Mesa) QR de la mesa → nombre → carta → pedido → pago →
 *                preparación → listo → retiro. La pantalla tiene que dejar
 *                claro que el pedido se prepara recién cuando está pago.
 *  mostrador_qr  (Mostrador QR) QR del local → carta → pedido (nombre
 *                opcional) → pago ahora o en caja → preparación → listo →
 *                retiro. El pedido entra al local en cuanto se confirma; el
 *                pago solo cambia cuándo se cobra. No hay paso previo: la
 *                identidad del teléfono se crea recién al confirmar.
 *
 * Todo sale del servidor (supabase/pedidos-mesa.sql y
 * pedidos-mostrador-qr.sql): cerrar la pestaña, perder el aviso o volver a
 * escanear el QR más tarde devuelve el mismo estado. */

export interface TablePickupInitial {
  token: string;
  flow: PickupFlow;
  /* La mesa del QR. En el mostrador no hay. */
  tableNumber: number | null;
  branchName: string;
  logoUrl: string | null;
  colorMarca: BrandColorId | null;
  operational: boolean;
  menu: GuestMenuProduct[];
  /* El local acepta Mercado Pago y la cuenta está conectada. */
  mercadoPagoReady: boolean;
  /* Se ofrece "Pagar en caja": en el mostrador, si hay algún método
   * presencial habilitado (counterPayOptions). En la mesa, siempre. */
  cashReady: boolean;
  state: PickupState | null;
  returningPaymentId: string | null;
}

type Tab = "carta" | "pedidos";

const POLL_ACTIVE_MS = 5_000;
const POLL_IDLE_MS = 15_000;

const newKey = () => crypto.randomUUID();

type ApiState = { ok: boolean; reason?: string; state?: PickupState | null };

/* En el mostrador la identidad del teléfono vence con la jornada (o se pierde
 * con la cookie): se abre otra y el pedido se reintenta una vez. */
const REJOIN_REASONS = new Set(["no-guest", "comensal-invalido", "mesa-cerrada"]);

const noSubscribe = () => () => {};

/* Los navegadores de la cámara pierden la cookie httpOnly al cerrar; la copia
 * local la repone sin crear otro comensal. */
const restoreGuest = async (token: string): Promise<boolean> => {
  const cred = loadGuestCred(token);
  if (!cred) return false;
  const res = await fetch(`/api/m/${token}/restaurar`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cred }),
  });
  const data = (await res.json().catch(() => null)) as { ok: boolean } | null;
  if (data?.ok) return true;
  clearGuestCred(token);
  return false;
};

export const TablePickupApp = ({ initial }: { initial: TablePickupInitial }) => {
  const { t } = useApp();
  const router = useRouter();
  const confirmar = useConfirm();
  const errorText = useErrorText();
  const { token } = initial;
  const counter = initial.flow === "mostrador_qr";

  const [state, setState] = useState<PickupState | null>(initial.state);
  const guest = state?.guest ?? null;
  /* Mostrador: se entró con un QR regenerado. Se ven y se pagan los pedidos
   * que ya tiene el teléfono; para uno nuevo hay que escanear el cartel
   * vigente. */
  const qrStale = counter && state?.qrValid === false;
  /* Mostrador: sin ningún método de pago habilitado no se toman pedidos. */
  const sinMetodos = counter && !initial.cashReady && !initial.mercadoPagoReady;
  /* Mostrador: los textos que hablan de cómo pagar dicen solo lo que el local
   * ofrece ("" = las dos opciones). */
  const pagoTexto = counterPayTextKey(initial.cashReady, initial.mercadoPagoReady);
  /* En el mostrador se puede pedir sin identidad previa: se crea al confirmar. */
  const canOrder = counter
    ? initial.operational && state?.operational !== false && !qrStale && !sinMetodos
    : Boolean(guest && state?.canOrder && initial.operational);
  const orders = useMemo(() => state?.orders ?? [], [state]);
  const hasActive = orders.some((o) => pickupActive(o.status));

  const [tab, setTab] = useState<Tab>(
    initial.returningPaymentId ||
      initial.state?.qrValid === false ||
      (initial.state?.orders ?? []).some((o) => pickupActive(o.status))
      ? "pedidos"
      : "carta",
  );
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orderKey, setOrderKey] = useState(newKey);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(initial.returningPaymentId);
  const [flashIds, setFlashIds] = useState<ReadonlySet<string>>(new Set());
  const [pushOn, setPushOn] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [name, setName] = useState("");
  /* Se lee en el cliente: el servidor no sabe qué navegador es. */
  const pushCapable = useSyncExternalStore(
    noSubscribe,
    () => (counter ? webPushAvailable() : canOfferWebPush()),
    () => false,
  );

  const applyState = useCallback((next: PickupState | null | undefined) => {
    if (next) setState(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/m/${token}/autoservicio`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as ApiState | null;
      if (data?.ok && data.state) setState(data.state);
    } catch {
      /* Sin red un momento: el próximo tick vuelve a intentar. */
    }
  }, [token]);

  /* Poll con la pestaña visible, más seguido mientras hay algo en juego. */
  useEffect(() => {
    let id: number | undefined;
    const tick = () => {
      window.clearInterval(id);
      if (document.visibilityState === "visible") {
        void refresh();
        id = window.setInterval(
          () => void refresh(),
          hasActive || checking ? POLL_ACTIVE_MS : POLL_IDLE_MS,
        );
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
  }, [refresh, hasActive, checking]);

  /* Sin un toque previo el navegador no deja sonar el aviso. */
  useEffect(() => {
    const unlock = () => void unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  /* El aviso de "listo": suena, vibra y marca la tarjeta. Solo lo que cambió
   * con la pantalla abierta; al abrir con un pedido ya listo no suena. */
  const lastStatuses = useRef<Map<string, OrderStatus> | null>(null);
  useEffect(() => {
    const prev = lastStatuses.current;
    lastStatuses.current = new Map(orders.map((o) => [o.id, o.status]));
    if (!prev) return;
    const ready = newlyReady(prev, orders);
    if (!ready.length) return;
    alertCustomerReady();
    for (const id of ready) {
      const o = orders.find((x) => x.id === id);
      if (!o) continue;
      const pagaAlRetirar = counter && counterPayState(o) !== "pagado";
      void showReadyNotice({
        reference: o.reference,
        url: `/m/${token}`,
        body: t(pagaAlRetirar ? "mostradorQr.pushListoCaja" : "retiro.pushListo", {
          n: o.reference,
        }),
      });
    }
    setFlashIds(new Set(ready));
    setTab("pedidos");
  }, [orders, token, t, counter]);

  /* El destello dura unos segundos; el estado "Listo" queda. */
  useEffect(() => {
    if (!flashIds.size) return;
    const timer = window.setTimeout(() => setFlashIds(new Set()), 4000);
    return () => window.clearTimeout(timer);
  }, [flashIds]);

  /* Vuelta de Mercado Pago: solo vale lo que confirmó el webhook, así que
   * espera a que el cobro deje de estar pendiente. */
  useEffect(() => {
    if (!checking || !state) return;
    const order = orders.find((o) => o.payment?.id === checking);
    if (order?.payment?.status === "pendiente") return;
    const ns = counter ? "mostradorQr" : "retiro";
    if (order?.payment?.status === "pagado") setNotice(t(`${ns}.mpAprobado`));
    else if (order) setNotice(t(`${ns}.mpNoAprobado`));
    setChecking(null);
    router.replace(`/m/${token}`);
  }, [checking, state, orders, router, token, t, counter]);

  /* Mostrador: sin la cookie no hay pedidos a la vista. Si el teléfono tiene
   * la copia local, se repone en silencio y aparecen. */
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!counter || guest || restoredRef.current) return;
    restoredRef.current = true;
    void restoreGuest(token)
      .then((ok) => (ok ? refresh() : undefined))
      .catch(() => {
        /* Sin red: la copia queda para el próximo escaneo. */
      });
  }, [counter, guest, token, refresh]);

  /* Quien ya dio permiso de avisos sigue suscripto al volver a escanear: la
   * suscripción se vuelve a atar a este comensal sin preguntar de nuevo. Va
   * por el id y no por el objeto: cada poll trae un `guest` nuevo y no hay
   * que volver a suscribir cada cinco segundos. */
  const guestId = guest?.id ?? null;
  useEffect(() => {
    if (!guestId || !pushCapable || !notificationPermissionGranted()) return;
    let alive = true;
    void subscribeWebPush(token, { url: `/api/m/${token}/autoservicio/avisos` }).then((r) => {
      if (alive && r.ok) setPushOn(true);
    });
    return () => {
      alive = false;
    };
  }, [guestId, token, pushCapable]);

  const activarAvisos = async () => {
    const ns = counter ? "mostradorQr" : "retiro";
    setPushError(null);
    const permitido = await requestNotificationPermission();
    if (!permitido) {
      setPushError(t(`${ns}.avisosDenegados`));
      return;
    }
    const r = await subscribeWebPush(token, { url: `/api/m/${token}/autoservicio/avisos` });
    if (r.ok) setPushOn(true);
    else setPushError(t(`${ns}.avisosError`));
  };

  const products = useMemo(
    () => new Map(initial.menu.map((p) => [p.id, p])),
    [initial.menu],
  );
  const cartLines = useMemo(() => lineasDelCarrito(cart, products), [cart, products]);
  const cartTotal = totalCarrito(cartLines);
  const cartCount = itemsCarrito(cartLines);

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
  }, [guest]);

  /* Un carrito distinto es otro pedido: clave nueva. */
  const setQty = (id: string, q: number) => {
    setCart((c) => ({ ...c, [id]: clampCantidad(q) }));
    setOrderKey(newKey());
    setSendError(null);
  };

  const irAlCheckout = (url: string) => {
    window.location.assign(url);
  };

  /* Mostrador: la identidad del teléfono (cookie + copia local), sin nombre. */
  const joinCounter = async (): Promise<boolean> => {
    const res = await fetch(`/api/m/${token}/autoservicio/unirse`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = (await res.json().catch(() => null)) as (ApiState & { cred?: string }) | null;
    if (!data?.ok || !data.state) {
      setSendError(errorText(data?.reason));
      return false;
    }
    if (typeof data.cred === "string") saveGuestCred(token, data.cred);
    setState(data.state);
    return true;
  };

  const openPay = () => {
    setSendError(null);
    if (counter) setName((n) => n || guest?.name || "");
    setPayOpen(true);
  };

  const confirmOrder = async (method: PickupPayChoice) => {
    if (sending || !cartLines.length) return;
    let alias: string | null = null;
    if (counter) {
      const parsed = customerAliasSchema.safeParse(name);
      if (!parsed.success) {
        setSendError(parsed.error.issues[0]?.message ?? t("mesa.error.nombre-invalido"));
        return;
      }
      alias = parsed.data;
    }
    setSending(true);
    setSendError(null);
    try {
      if (counter && !(guest && state?.canOrder) && !(await joinCounter())) return;
      const send = async () => {
        const res = await fetch(`/api/m/${token}/autoservicio/pedidos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: orderKey,
            items: itemsParaEnviar(cartLines),
            method,
            ...(counter ? { name: alias ?? "" } : {}),
          }),
        });
        return (await res.json().catch(() => null)) as
          | (ApiState & {
              checkoutUrl?: string | null;
              checkoutError?: string | null;
              reference?: string;
              message?: string;
            })
          | null;
      };
      let data = await send();
      if (counter && !data?.ok && REJOIN_REASONS.has(data?.reason ?? "")) {
        if (!(await joinCounter())) return;
        data = await send();
      }
      if (!data?.ok) {
        setSendError(data?.message ?? errorText(data?.reason));
        return;
      }
      applyState(data.state);
      setCart({});
      /* Clave nueva recién con el pedido creado: un reintento del mismo
       * carrito después de un corte de red no duplica el pedido. */
      setOrderKey(newKey());
      setPayOpen(false);
      setReviewOpen(false);
      setTab("pedidos");
      if (method === "mercado_pago") {
        if (data.checkoutUrl) {
          irAlCheckout(data.checkoutUrl);
          return;
        }
        setError(t(counter ? "mostradorQr.mpNoAbrio" : "retiro.mpNoAbrio"));
        return;
      }
      /* En el mostrador la tarjeta del pedido ya dice "Pedido recibido". */
      if (!counter) setNotice(t("retiro.pedidoACaja", { n: data.reference ?? "" }));
    } catch {
      setSendError(t("mesa.error.red"));
    } finally {
      setSending(false);
    }
  };

  const changePayment = async (orderId: string, method: PickupPayChoice) => {
    if (busyOrder) return;
    setBusyOrder(orderId);
    setError(null);
    try {
      const res = await fetch(`/api/m/${token}/autoservicio/pedidos/${orderId}/pago`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const data = (await res.json().catch(() => null)) as
        | (ApiState & { checkoutUrl?: string | null })
        | null;
      if (!data?.ok) {
        setError(errorText(data?.reason));
        void refresh();
        return;
      }
      applyState(data.state);
      if (method === "mercado_pago" && data.checkoutUrl) {
        irAlCheckout(data.checkoutUrl);
        return;
      }
      if (method === "caja") {
        setNotice(t(counter ? "mostradorQr.pasasteACaja" : "retiro.pasasteACaja"));
      }
    } catch {
      setError(t("mesa.error.red"));
    } finally {
      setBusyOrder(null);
    }
  };

  const cancelOrder = async (orderId: string) => {
    if (busyOrder) return;
    const ok = await confirmar({
      title: t("retiro.cancelarTitulo"),
      body: t("retiro.cancelarCuerpo"),
      confirmLabel: t("retiro.cancelarSi"),
      cancelLabel: t("acciones.volver"),
      tone: "peligro",
    });
    if (!ok) return;
    setBusyOrder(orderId);
    setError(null);
    try {
      const res = await fetch(`/api/m/${token}/autoservicio/pedidos/${orderId}/cancelar`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as ApiState | null;
      if (!data?.ok) {
        setError(errorText(data?.reason));
        void refresh();
        return;
      }
      applyState(data.state);
      setNotice(t("retiro.pedidoCancelado"));
    } catch {
      setError(t("mesa.error.red"));
    } finally {
      setBusyOrder(null);
    }
  };

  if (!counter && (!guest || !canOrder)) {
    return (
      <CustomerBrandShell color={initial.colorMarca}>
        <PickupJoin
          token={token}
          initial={initial}
          state={state}
          onJoined={(next) => {
            setState(next);
            setTab(next.orders.some((o) => pickupActive(o.status)) ? "pedidos" : "carta");
          }}
        />
      </CustomerBrandShell>
    );
  }

  const tableNumber = state?.table?.number ?? initial.tableNumber;
  const activeOrders = orders.filter((o) => pickupActive(o.status));
  const pastOrders = orders.filter((o) => !pickupActive(o.status));
  const esperando = activeOrders.some((o) => o.status !== "listo");
  const showPushOffer = !counter && !pushOn && pushCapable && esperando;
  const showBar = tab === "carta" && cartCount > 0;

  return (
    <CustomerBrandShell color={initial.colorMarca}>
      <main
        className={`mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pt-4 ${showBar ? "pb-32" : "pb-10"}`}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CustomerBrandHeader
              name={initial.branchName}
              logoUrl={initial.logoUrl}
              align="start"
            />
            <h1 className="font-display text-3xl uppercase text-marca">
              {counter ? t("mostradorQr.titulo") : t("mesa.mesaN", { n: tableNumber ?? "" })}
            </h1>
            {guest?.name && (
              <p className="mt-0.5 text-base text-suave">{t("mesa.hola", { n: guest.name })}</p>
            )}
          </div>
          <Controls showTheme={false} />
        </header>

        <PickupSteps flow={initial.flow} pagoTexto={pagoTexto} className="mt-4" />

        {sinMetodos && !qrStale && (
          <CustomerNotice tone="curso" className="mt-4">
            <p className="font-semibold">{t("mostradorQr.sinMetodosTitulo")}</p>
            <p className="mt-0.5">{t("mostradorQr.sinMetodosCuerpo")}</p>
          </CustomerNotice>
        )}
        {qrStale && !state?.orderLink && (
          <CustomerNotice tone="curso" className="mt-4">
            <p className="font-semibold">{t("mostradorQr.qrVencidoTitulo")}</p>
            <p className="mt-0.5">{t("mostradorQr.qrVencidoCuerpo")}</p>
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
        {checking && (
          <CustomerNotice tone="curso" className="mt-4">
            <span className="flex items-center gap-2">
              <Spinner inline className="size-4" /> {t("retiro.mpVerificando")}
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
          className="sticky top-0 z-20 -mx-4 mt-4 grid grid-cols-2 gap-2 border-b border-linea bg-crema/90 px-4 py-2 backdrop-blur"
        >
          {(["carta", "pedidos"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              type="button"
              onClick={() => {
                setTab(k);
                setNotice(null);
                setError(null);
              }}
              className={`relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1 py-2 text-sm font-semibold transition ${
                tab === k
                  ? "border-marca bg-marca text-crema"
                  : "border-linea bg-surface text-suave hover:text-carbon"
              }`}
            >
              <TabGlyph k={k === "pedidos" ? "pedido" : "carta"} size={26} />
              {k === "carta" ? t("mesa.tab.carta") : t("retiro.tabPedidos")}
              {k === "pedidos" && activeOrders.length > 0 && (
                <span
                  className={`absolute right-2 top-2 grid min-h-7 min-w-7 place-items-center rounded-full px-1.5 text-sm font-bold tabular-nums ${
                    tab === k ? "bg-crema text-marca" : "bg-marca text-crema"
                  }`}
                >
                  {activeOrders.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {tab === "carta" && (
          <MenuBrowser
            menu={initial.menu}
            cart={cart}
            puedePedir={canOrder}
            onCantidad={setQty}
            stickyTop={navAlto}
          />
        )}

        {tab === "pedidos" && (
          <section className="mt-4 flex flex-col gap-4">
            {counter && esperando && (
              <CounterNoticeBox
                pushOn={pushOn}
                pushCapable={pushCapable}
                pushError={pushError}
                onActivate={() => void activarAvisos()}
              />
            )}
            {showPushOffer && (
              <div className="flex flex-col gap-2 rounded-2xl border border-linea bg-surface p-4">
                <p className="text-base text-carbon">{t("retiro.avisosPregunta")}</p>
                <button
                  type="button"
                  onClick={() => void activarAvisos()}
                  className="min-h-12 w-full rounded-full border-2 border-marca px-4 text-base font-semibold text-marca"
                >
                  {t("retiro.avisosActivar")}
                </button>
                {pushError && <p className="text-sm text-alerta">{pushError}</p>}
              </div>
            )}
            {!counter && pushOn && activeOrders.length > 0 && (
              <p className="text-sm text-suave">{t("retiro.avisosActivos")}</p>
            )}

            {orders.length === 0 ? (
              <CustomerEmpty
                titulo={t("retiro.sinPedidos")}
                cuerpo={t(counter ? "mostradorQr.sinPedidosAyuda" : "retiro.sinPedidosAyuda")}
              />
            ) : (
              <>
                {activeOrders.map((o) => (
                  <PickupOrderCard
                    key={o.id}
                    order={o}
                    tableNumber={tableNumber}
                    mercadoPagoReady={initial.mercadoPagoReady}
                    cashReady={initial.cashReady}
                    busy={busyOrder === o.id}
                    flash={flashIds.has(o.id)}
                    onPayMercadoPago={() => void changePayment(o.id, "mercado_pago")}
                    onPayAtCounter={() => void changePayment(o.id, "caja")}
                    onCancel={() => void cancelOrder(o.id)}
                  />
                ))}
                {pastOrders.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-suave">
                      {t("retiro.anteriores")}
                    </h2>
                    {pastOrders.map((o) => (
                      <PickupOrderCard
                        key={o.id}
                        order={o}
                        tableNumber={tableNumber}
                        mercadoPagoReady={false}
                        cashReady={false}
                        busy={false}
                        onPayMercadoPago={() => {}}
                        onPayAtCounter={() => {}}
                        onCancel={() => {}}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {!counter && <TableOrdersList state={state} className="mt-2" />}

            <button
              type="button"
              onClick={() => setTab("carta")}
              className="min-h-14 w-full rounded-full bg-marca px-5 text-base font-semibold text-crema"
            >
              {orders.length ? t("retiro.otroPedido") : t("retiro.verCarta")}
            </button>
          </section>
        )}

        {showBar && (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-linea bg-surface/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
            <div className="mx-auto flex max-w-lg">
              <button
                type="button"
                onClick={() => setReviewOpen(true)}
                className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full bg-marca px-4 text-base font-semibold text-crema"
              >
                <span className="grid min-h-7 min-w-7 shrink-0 place-items-center rounded-full bg-crema px-1.5 text-sm font-bold tabular-nums text-marca">
                  {cartCount}
                </span>
                {t("mesa.verPedido")}
                <span className="tabular-nums">{formatMoney(cartTotal)}</span>
              </button>
            </div>
          </div>
        )}

        {reviewOpen && !payOpen && (
          <OrderReview
            lineas={cartLines}
            enviando={false}
            error={null}
            enviado={null}
            puedePedir={canOrder}
            onCantidad={setQty}
            onEnviar={openPay}
            onSeguirPidiendo={() => {
              setReviewOpen(false);
              setTab("carta");
            }}
            onVerPedidos={() => {
              setReviewOpen(false);
              setTab("pedidos");
            }}
            onClose={() => setReviewOpen(false)}
            enviarLabel={t("retiro.confirmarPedido")}
            enviarAyuda={t(
              counter ? `mostradorQr.confirmarPedidoAyuda${pagoTexto}` : "retiro.confirmarPedidoAyuda",
            )}
          />
        )}

        {payOpen && (
          <PayChoiceSheet
            flow={initial.flow}
            name={name}
            onName={(v) => {
              setName(v);
              setSendError(null);
            }}
            total={cartTotal}
            mercadoPagoReady={initial.mercadoPagoReady}
            cashReady={initial.cashReady}
            sending={sending}
            error={sendError}
            onChoose={(m) => void confirmOrder(m)}
            onClose={() => {
              if (sending) return;
              setPayOpen(false);
            }}
          />
        )}
      </main>
    </CustomerBrandShell>
  );
};

/* Sufijo de los textos del mostrador que hablan de cómo pagar: las dos
 * opciones (""), solo en caja ("Caja") o solo Mercado Pago ("Mp"). */
const counterPayTextKey = (cash: boolean, mp: boolean): "" | "Caja" | "Mp" =>
  cash && !mp ? "Caja" : mp && !cash ? "Mp" : "";

/* Los tres pasos, siempre a la vista: acá no hay mozo que lo explique. */
const PickupSteps = ({
  flow,
  pagoTexto = "",
  className = "",
}: {
  flow: PickupFlow;
  pagoTexto?: string;
  className?: string;
}) => {
  const { t } = useApp();
  const counter = flow === "mostrador_qr";
  const ns = counter ? "mostradorQr" : "retiro";
  const pasos = [t(`${ns}.paso1`), t(`${ns}.paso2${counter ? pagoTexto : ""}`), t(`${ns}.paso3`)];
  return (
    <ol className={`grid grid-cols-3 gap-2 ${className}`.trim()}>
      {pasos.map((p, i) => (
        <li
          key={p}
          className="flex flex-col gap-1 rounded-2xl border border-linea bg-surface px-3 py-2.5"
        >
          <span className="font-display text-xl leading-none tabular-nums text-marca">{i + 1}</span>
          <span className="text-sm leading-snug text-carbon">{p}</span>
        </li>
      ))}
    </ol>
  );
};

/* Los pedidos vivos de la mesa que no son de este teléfono. Es lo que ve quien
 * perdió la cookie o volvió a escanear desde otro celular: por el número
 * reconoce el suyo. */
const TableOrdersList = ({
  state,
  className = "",
}: {
  state: PickupState | null;
  className?: string;
}) => {
  const { t } = useApp();
  const list = state?.tableOrders ?? [];
  if (!list.length) return null;
  return (
    <section className={className}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-suave">
        {t("retiro.pedidosDeLaMesa")}
      </h2>
      <ul className="mt-2 flex flex-col gap-2">
        {list.map((o) => {
          const stage = pickupStage(o.status);
          return (
            <li
              key={`${o.reference}-${o.createdAt}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-linea bg-surface px-4 py-3"
            >
              <span className="font-semibold text-carbon">
                {t("retiro.pedidoN", { n: o.reference })}
              </span>
              <span
                className={`text-sm font-semibold ${
                  stage === "listo" ? "text-ok" : stage === "esperando-pago" ? "text-curso" : "text-marca"
                }`}
              >
                {t(`retiro.estado.${stage}`)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/* Mostrador: cómo se va a enterar de que está listo. El botón aparece solo
 * si este navegador de verdad puede recibir el aviso; si no, lo único que
 * sirve es dejar la pestaña abierta, y eso es lo que dice. */
const CounterNoticeBox = ({
  pushOn,
  pushCapable,
  pushError,
  onActivate,
}: {
  pushOn: boolean;
  pushCapable: boolean;
  pushError: string | null;
  onActivate: () => void;
}) => {
  const { t } = useApp();
  if (pushOn) return <p className="text-sm text-suave">{t("retiro.avisosActivos")}</p>;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-linea bg-surface p-4">
      <p className="text-base text-carbon">
        {pushCapable ? t("mostradorQr.avisosDisponible") : t("mostradorQr.avisosNoDisponible")}
      </p>
      {pushCapable && (
        <button
          type="button"
          onClick={onActivate}
          className="min-h-12 w-full rounded-full border-2 border-marca px-4 text-base font-semibold text-marca"
        >
          {t("mostradorQr.avisosActivar")}
        </button>
      )}
      {pushError && <p className="text-sm text-alerta">{pushError}</p>}
    </div>
  );
};

/* Elegir cómo pagar es lo que confirma el pedido.
 *
 * Mesa: la aclaración va pegada a los botones porque sin pago la cocina no
 * lo ve. Mostrador: el pedido sale igual con los dos botones; lo único que
 * cambia es cuándo se cobra. Arriba, el nombre, que es opcional. */
const PayChoiceSheet = ({
  flow,
  name,
  onName,
  total,
  mercadoPagoReady,
  cashReady,
  sending,
  error,
  onChoose,
  onClose,
}: {
  flow: PickupFlow;
  name: string;
  onName: (v: string) => void;
  total: number;
  mercadoPagoReady: boolean;
  cashReady: boolean;
  sending: boolean;
  error: string | null;
  onChoose: (m: PickupPayChoice) => void;
  onClose: () => void;
}) => {
  const { t } = useApp();
  const counter = flow === "mostrador_qr";
  return (
    <ModalShell
      onClose={onClose}
      labelledBy="pagar-titulo"
      busy={sending}
      busyLabel={t("retiro.confirmando")}
      footer={
        <div className="flex flex-col gap-2.5">
          {error && (
            <CustomerNotice tone="alerta" role="alert">
              {error}
            </CustomerNotice>
          )}
          {mercadoPagoReady && (
            <button
              type="button"
              disabled={sending}
              onClick={() => onChoose("mercado_pago")}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-marca px-5 text-base font-semibold text-crema disabled:opacity-50"
            >
              {sending && <Spinner inline className="size-4" />}
              {t("retiro.pagarMp", { n: formatMoney(total) })}
            </button>
          )}
          {cashReady && (
            <button
              type="button"
              disabled={sending}
              onClick={() => onChoose("caja")}
              className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-5 text-base font-semibold disabled:opacity-50 ${
                mercadoPagoReady
                  ? "border-2 border-marca text-marca"
                  : "bg-marca text-crema"
              }`}
            >
              {sending && !mercadoPagoReady && <Spinner inline className="size-4" />}
              {t(counter ? "mostradorQr.pagarEnCaja" : "retiro.pagarEnCaja")}
            </button>
          )}
        </div>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="pagar-titulo" className="font-display text-2xl uppercase text-marca">
          {t("retiro.comoPagar")}
        </h2>
        <ModalCloseBtn onClick={onClose} disabled={sending} label={t("mesa.cerrar")} />
      </div>
      <p className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-base font-semibold text-carbon">
        {t("mesa.totalPedido")}
        <span className="font-display text-2xl tabular-nums text-marca">{formatMoney(total)}</span>
      </p>
      {counter && (
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-base font-semibold text-carbon">{t("mostradorQr.nombreLabel")}</span>
          <input
            value={name}
            onChange={(e) => onName(e.target.value)}
            disabled={sending}
            autoComplete="given-name"
            maxLength={24}
            className="min-h-12 w-full rounded-2xl border-2 border-linea bg-surface px-4 text-base text-carbon outline-none placeholder:text-suave focus:border-marca focus:ring-2 focus:ring-marca/20"
            placeholder={t("mesa.nombrePlaceholder")}
          />
          <span className="text-sm leading-snug text-suave">{t("mostradorQr.nombreAyuda")}</span>
        </label>
      )}
      <CustomerNotice tone="curso" className="mt-4">
        {t(
          counter
            ? `mostradorQr.seEnviaYa${counterPayTextKey(cashReady, mercadoPagoReady)}`
            : "retiro.seCocinaAlPagar",
        )}
      </CustomerNotice>
      <p className="mt-3 text-base leading-snug text-suave">
        {t(
          `${counter ? "mostradorQr" : "retiro"}.${
            !cashReady ? "comoPagarSoloMp" : mercadoPagoReady ? "comoPagarAyuda" : "comoPagarSoloCaja"
          }`,
        )}
      </p>
    </ModalShell>
  );
};

/* Primera vez en la mesa (o volvió sin la cookie): cómo funciona, los pedidos
 * de la mesa que siguen vivos, y el nombre para empezar a pedir. */
const PickupJoin = ({
  token,
  initial,
  state,
  onJoined,
}: {
  token: string;
  initial: TablePickupInitial;
  state: PickupState | null;
  onJoined: (s: PickupState) => void;
}) => {
  const { t } = useApp();
  const errorText = useErrorText();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(!state?.guest);
  const [error, setError] = useState<string | null>(null);

  /* Mismo camino que la cuenta de la mesa: los navegadores de la cámara
   * pierden la cookie httpOnly al cerrar; la copia local la repone. */
  useEffect(() => {
    if (state?.guest) return;
    let cancelled = false;
    const restore = async () => {
      try {
        if (!(await restoreGuest(token)) || cancelled) return;
        const again = await fetch(`/api/m/${token}/autoservicio`, { cache: "no-store" });
        const next = (await again.json().catch(() => null)) as ApiState | null;
        if (!cancelled && next?.ok && next.state?.guest && next.state.canOrder) {
          onJoined(next.state);
          return;
        }
        clearGuestCred(token);
      } catch {
        /* Sin red: la copia queda para el próximo escaneo. */
      }
    };
    void restore().finally(() => {
      if (!cancelled) setRestoring(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, state?.guest, onJoined]);

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
      const res = await fetch(`/api/m/${token}/autoservicio/unirse`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parsed.data }),
      });
      const data = (await res.json().catch(() => null)) as
        | (ApiState & { message?: string; cred?: string })
        | null;
      if (!data?.ok || !data.state) {
        setError(data?.message ?? errorText(data?.reason));
        return;
      }
      if (typeof data.cred === "string") saveGuestCred(token, data.cred);
      onJoined(data.state);
    } catch {
      setError(t("mesa.error.red"));
    } finally {
      setBusy(false);
    }
  };

  const tableNumber = state?.table?.number ?? initial.tableNumber ?? "";
  const previous = (state?.orders ?? []).filter((o) => pickupActive(o.status));

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-12">
      <Controls showTheme={false} className="absolute right-4 top-4" />
      <CustomerBrandHeader name={initial.branchName} logoUrl={initial.logoUrl} align="start" />
      <h1 className="mt-1 font-display text-4xl uppercase text-marca">
        {t("mesa.mesaN", { n: tableNumber })}
      </h1>
      <p className="mt-2 text-lg font-semibold text-carbon">{t("retiro.titulo")}</p>
      <PickupSteps flow="autoservicio" className="mt-4" />

      {previous.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-suave">
            {t("retiro.tusPedidos")}
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {previous.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-linea bg-surface px-4 py-3"
              >
                <span className="font-semibold text-carbon">{t("retiro.pedidoN", { n: o.reference })}</span>
                <span className="text-sm font-semibold text-marca">
                  {t(`retiro.estado.${pickupStage(o.status)}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <TableOrdersList state={state} className="mt-6" />

      {restoring ? (
        <div className="mt-8 flex justify-center" aria-busy="true">
          <Spinner inline className="size-6" />
        </div>
      ) : initial.operational && state?.operational !== false ? (
        <form onSubmit={(e) => void join(e)} className="mt-8 flex flex-col gap-3">
          <label className="flex flex-col gap-2">
            <span className="text-lg font-semibold text-carbon">{t("mesa.tuNombre")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
              maxLength={24}
              className="min-h-14 w-full rounded-2xl border-2 border-linea bg-surface px-4 text-lg text-carbon outline-none placeholder:text-suave focus:border-marca focus:ring-2 focus:ring-marca/20"
              placeholder={t("mesa.nombrePlaceholder")}
            />
          </label>
          <p className="text-sm leading-relaxed text-suave">{t("retiro.nombreAyuda")}</p>
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
            {t("retiro.empezar")}
          </button>
        </form>
      ) : (
        <p className="mt-6 text-base leading-relaxed text-suave">{t("mesa.noDisponible")}</p>
      )}
    </main>
  );
};

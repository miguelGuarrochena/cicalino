"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { Controls } from "@/components/ui/Controls";
import { Spinner } from "@/components/ui/Spinner";
import {
  BillTotals,
  ConsumptionTable,
  PaymentRows,
} from "@/components/tables/BillParts";
import { PaySheet } from "@/components/customer/table/PaySheet";
import { TransferDetails, useErrorText } from "@/components/customer/table/TransferDetails";
import { guestNameSchema } from "@/lib/schemas";
import {
  formatMoney,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";
import type { OrderStatus } from "@/lib/types";

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
  const [notice, setNotice] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(initial.returningPaymentId);
  const applyBill = useCallback((next: TableBill | null) => {
    if (next) setBill(next);
  }, []);

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
  const cartLines = Object.entries(cart)
    .filter(([id, q]) => q > 0 && products.has(id))
    .map(([id, q]) => ({ product: products.get(id)!, quantity: q }));
  const cartTotal = cartLines.reduce((s, l) => s + l.product.price * l.quantity, 0);
  const cartCount = cartLines.reduce((s, l) => s + l.quantity, 0);

  const categories = useMemo(() => {
    const out = new Map<string, GuestMenuProduct[]>();
    for (const p of initial.menu) {
      const k = p.category?.trim() || t("mesa.sinCategoria");
      out.set(k, [...(out.get(k) ?? []), p]);
    }
    return [...out.entries()];
  }, [initial.menu, t]);

  const errorText = useErrorText();

  /* A changed cart is a different order, so it gets a new idempotency key. */
  const setQty = (id: string, q: number) => {
    setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(50, q)) }));
    setOrderKey(newKey());
  };

  const sendOrder = async () => {
    if (sending || !cartLines.length) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/m/${token}/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: orderKey,
          items: cartLines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; reason?: string; bill?: TableBill }
        | null;
      if (!data?.ok) {
        setError(errorText(data?.reason));
        return;
      }
      applyBill(data.bill ?? null);
      setCart({});
      /* New key only after success: a retry of the same cart after a network
       * error reuses the old key and can't create a duplicate order. */
      setOrderKey(newKey());
      setNotice(t("mesa.pedidoEnviado"));
      setTab("pedidos");
    } catch {
      setError(t("mesa.error.red"));
    } finally {
      setSending(false);
    }
  };

  const cancelOrder = async (orderId: string) => {
    if (sending || !window.confirm(t("mesa.cancelarPedidoConfirmar"))) return;
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
      <JoinTable
        token={token}
        tableNumber={initial.tableNumber}
        branchName={initial.branchName}
        operational={initial.operational}
        onJoined={(g, b) => {
          setGuest(g);
          applyBill(b);
        }}
      />
    );
  }

  const open = bill.session.status === "abierta";
  const myOrders = bill.orders.filter((o) => o.guestId === guest.id);
  const unpaid = open && bill.totals.available > 0;
  const hasConsumption = bill.totals.consumption > 0;
  const showBar = cartCount > 0 || hasConsumption || tab === "cuenta";

  return (
    <main className={`mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pt-4 ${showBar ? "pb-32" : "pb-8"}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-carbon/50">
            {initial.branchName}
          </p>
          <h1 className="font-display text-3xl uppercase text-marca">
            {t("mesa.mesaN", { n: bill.session.tableNumber })}
          </h1>
          <p className="text-sm text-carbon/60">{t("mesa.hola", { n: guest.name })}</p>
        </div>
        <Controls />
      </header>

      {open && (
        <button
          type="button"
          disabled={sending || Boolean(bill.session.calledAt)}
          onClick={() => void callStaff()}
          className="mt-3 min-h-11 w-full rounded-full border border-marca px-4 text-sm font-semibold text-marca disabled:opacity-60"
        >
          {bill.session.calledAt ? t("mesa.llamandoMozo") : t("mesa.llamarMozo")}
        </button>
      )}

      {!open && (
        <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          <p className="font-semibold">
            {bill.session.status === "pagada" ? t("mesa.mesaPagada") : t("mesa.mesaCerrada")}
          </p>
          <button
            type="button"
            onClick={() => {
              setGuest(null);
              setBill(null);
            }}
            className="mt-2 text-sm font-semibold underline"
          >
            {t("mesa.nuevaVisita")}
          </button>
        </div>
      )}

      {notice && (
        <p role="status" className="mt-4 rounded-xl bg-marca/10 px-3 py-2 text-sm text-marca">
          {notice}
        </p>
      )}
      {checkingPayment && (
        <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
          <Spinner inline className="size-4" /> {t("mesa.mpVerificando")}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      <nav
        role="tablist"
        aria-label={t("mesa.secciones")}
        className="sticky top-0 z-10 -mx-4 mt-4 flex gap-1 border-b border-linea bg-crema/90 px-4 py-2 backdrop-blur"
      >
        {(["carta", "pedidos", "cuenta"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            type="button"
            onClick={() => setTab(k)}
            className={`min-h-10 flex-1 rounded-full px-3 text-sm font-semibold transition ${
              tab === k ? "bg-marca text-crema" : "text-carbon/60 hover:bg-carbon/5"
            }`}
          >
            {t(`mesa.tab.${k}`)}
          </button>
        ))}
      </nav>

      {tab === "carta" && (
        <section className="mt-4 flex flex-col gap-5">
          {!initial.menu.length && (
            <p className="py-10 text-center text-sm text-carbon/55">{t("mesa.cartaVacia")}</p>
          )}
          {categories.map(([cat, items]) => (
            <div key={cat}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/50">{cat}</h2>
              <ul className="flex flex-col gap-2">
                {items.map((p) => {
                  const q = cart[p.id] ?? 0;
                  return (
                    <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-linea bg-surface p-3">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="size-14 shrink-0 rounded-xl object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-carbon">{p.name}</p>
                        {p.description && (
                          <p className="mt-0.5 text-xs text-carbon/55">{p.description}</p>
                        )}
                        <p className="mt-1 text-sm font-semibold tabular-nums text-marca">
                          {formatMoney(p.price)}
                        </p>
                      </div>
                      {open && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          {q > 0 && (
                            <>
                              <button
                                type="button"
                                aria-label={t("mesa.quitarUno", { n: p.name })}
                                onClick={() => setQty(p.id, q - 1)}
                                className="grid size-9 place-items-center rounded-full border border-linea text-lg text-carbon"
                              >
                                −
                              </button>
                              <span className="w-5 text-center font-semibold tabular-nums" aria-live="polite">
                                {q}
                              </span>
                            </>
                          )}
                          <button
                            type="button"
                            aria-label={t("mesa.agregarUno", { n: p.name })}
                            onClick={() => setQty(p.id, q + 1)}
                            className="grid size-9 place-items-center rounded-full bg-marca text-lg text-crema"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}

      {tab === "pedidos" && (
        <section className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-carbon/60">{t("mesa.pedidosAyuda")}</p>
          {!myOrders.length && (
            <p className="py-10 text-center text-sm text-carbon/55">{t("mesa.sinPedidos")}</p>
          )}
          {myOrders
            .slice()
            .reverse()
            .map((o) => (
              <article key={o.id} className="rounded-2xl border border-linea bg-surface p-3">
                <p className="flex items-center justify-between gap-2 text-xs text-carbon/55">
                  {new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  <OrderStatusChip status={o.status} />
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-carbon/80">
                  {o.items.map((i) => (
                    <li key={i.id}>
                      {i.quantity} × {i.name}
                    </li>
                  ))}
                </ul>
                {o.status === "creado" && open ? (
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void cancelOrder(o.id)}
                    className="mt-3 min-h-10 rounded-full border border-transparent px-4 text-sm font-semibold text-red-600 hover:border-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {t("mesa.cancelarPedido")}
                  </button>
                ) : o.status === "en_preparacion" || o.status === "listo" ? (
                  <p className="mt-3 text-xs text-carbon/55">{t("mesa.yaAnotadoAyuda")}</p>
                ) : null}
              </article>
            ))}
        </section>
      )}

      {tab === "cuenta" && (
        <section className="mt-4 flex flex-col gap-5">
          <BillTotals bill={bill} />
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/50">
              {t("mesa.seccionConsumo")}
            </h2>
            <ConsumptionTable bill={bill} highlightGuestId={guest.id} />
          </div>
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/50">
              {t("mesa.seccionPagos")}
            </h2>
            {bill.session.splitMode && (
              <p className="mt-2 text-xs text-carbon/55">
                {t("mesa.modoElegido", { m: t(`mesa.modo.${bill.session.splitMode}`) })}
                {bill.session.splitMode === "iguales" && bill.session.parts
                  ? ` · ${t("mesa.partesN", { n: bill.session.parts })}`
                  : ""}
              </p>
            )}
            <div className="mt-3">
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
                      onChanged={applyBill}
                    />
                  ) : null
                }
              />
            </div>
          </div>
        </section>
      )}

      {showBar && (
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-linea bg-surface/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg gap-2">
          {tab === "carta" && cartCount > 0 ? (
            <>
              <button
                type="button"
                onClick={() => void sendOrder()}
                disabled={sending || !open}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-marca px-5 font-semibold text-crema disabled:opacity-50"
              >
                {sending && <Spinner inline className="size-4" />}
                {t("mesa.pedirN", { n: cartCount, total: formatMoney(cartTotal) })}
              </button>
              {hasConsumption && (
                <button
                  type="button"
                  onClick={() => setTab("cuenta")}
                  className="min-h-12 rounded-full border-2 border-marca px-4 font-semibold text-marca"
                >
                  {t("mesa.verCuenta")}
                </button>
              )}
            </>
          ) : tab === "cuenta" ? (
            <>
              <button
                type="button"
                onClick={() => setTab("carta")}
                className="min-h-12 flex-1 rounded-full border-2 border-marca px-4 font-semibold text-marca"
              >
                {t("mesa.seguirPidiendo")}
              </button>
              {unpaid && (
                <button
                  type="button"
                  onClick={() => setPayOpen(true)}
                  className="min-h-12 flex-1 rounded-full bg-marca px-4 font-semibold text-crema"
                >
                  {t("mesa.pagar")}
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setTab("cuenta")}
                className="min-h-12 flex-1 rounded-full border-2 border-marca px-4 font-semibold text-marca"
              >
                {t("mesa.verCuenta")}
              </button>
              {unpaid && (
                <button
                  type="button"
                  onClick={() => setPayOpen(true)}
                  className="min-h-12 flex-1 rounded-full bg-marca px-4 font-semibold text-crema"
                >
                  {t("mesa.pagar")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      )}

      {payOpen && (
        <PaySheet
          token={token}
          bill={bill}
          guestId={guest.id}
          settings={initial.settings}
          mercadoPagoReady={initial.mercadoPagoReady}
          onClose={() => {
            setPayOpen(false);
            setTab("cuenta");
          }}
          onBill={applyBill}
          onStale={() => void refresh()}
        />
      )}
    </main>
  );
};

const OrderStatusChip = ({ status }: { status: OrderStatus }) => {
  const { t } = useApp();
  const cls =
    status === "listo"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
      : status === "retirado"
        ? "bg-carbon/10 text-carbon/60"
        : status === "cancelado"
          ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200"
          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {t(`mesa.estadoPedido.${status}`)}
    </span>
  );
};

const JoinTable = ({
  token,
  tableNumber,
  branchName,
  operational,
  onJoined,
}: {
  token: string;
  tableNumber: number;
  branchName: string;
  operational: boolean;
  onJoined: (g: { id: string; name: string }, b: TableBill) => void;
}) => {
  const { t } = useApp();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorText = useErrorText();

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parsed.data }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; reason?: string; message?: string; guest?: { id: string; name: string }; bill?: TableBill }
        | null;
      if (!data?.ok || !data.guest || !data.bill) {
        setError(data?.message ?? errorText(data?.reason));
        return;
      }
      onJoined(data.guest, data.bill);
    } catch {
      setError(t("mesa.error.red"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <Controls className="absolute right-4 top-4" />
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-carbon/50">{branchName}</p>
      <h1 className="mt-1 font-display text-4xl uppercase text-marca">
        {t("mesa.mesaN", { n: tableNumber })}
      </h1>
      {operational ? (
        <form onSubmit={(e) => void join(e)} className="mt-8 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-carbon/70">{t("mesa.tuNombre")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
              maxLength={24}
              autoFocus
              className="w-full rounded-xl border border-linea bg-surface px-4 py-3 text-carbon outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
              placeholder={t("mesa.nombrePlaceholder")}
            />
          </label>
          <p className="text-xs text-carbon/55">{t("mesa.nombreAyuda")}</p>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-2 flex min-h-12 items-center justify-center gap-2 rounded-full bg-marca px-6 font-semibold text-crema disabled:opacity-50"
          >
            {busy && <Spinner inline className="size-4" />}
            {t("mesa.entrar")}
          </button>
        </form>
      ) : (
        <p className="mt-6 text-carbon/65">{t("mesa.noDisponible")}</p>
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
  onChanged,
}: {
  token: string;
  paymentId: string;
  method: string;
  total: number;
  settings: PaymentSettings;
  onChanged: (b: TableBill | null) => void;
}) => {
  const { t } = useApp();
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    if (busy || !window.confirm(t("mesa.cancelarPagoConfirmar"))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/m/${token}/pagos/${paymentId}/cancelar`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { ok: boolean; bill?: TableBill } | null;
      if (data?.ok) onChanged(data.bill ?? null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-crema/60 p-2.5 text-xs text-carbon/70">
      {method === "transferencia" ? (
        <TransferDetails settings={settings} total={total} compact />
      ) : method === "mercado_pago" ? (
        <p>{t("mesa.mpPendienteAyuda")}</p>
      ) : (
        <p>{t("mesa.manualPendienteAyuda")}</p>
      )}
      <button
        type="button"
        onClick={() => void cancel()}
        disabled={busy}
        className="self-start font-semibold text-carbon/60 underline disabled:opacity-50"
      >
        {t("mesa.cancelarPago")}
      </button>
    </div>
  );
};

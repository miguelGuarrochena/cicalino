import type { OrderStatus } from "@/lib/types";

/* Table bill domain, shared by the guest screen, the panel and the API.
 *
 * The database is the authority: _crear_pago_mesa in
 * supabase/split-payments.sql computes and locks every amount. previewPayment
 * mirrors that computation so a guest sees the exact number before
 * confirming; the number is sent back as `monto_esperado`, and if the bill
 * moved in between the server answers `monto-cambio` with the new one instead
 * of charging something else. Keep both in sync (tests/unit/table-bill.test.ts
 * uses the same cases as the SQL checks). */

export type SplitMode = "consumo" | "iguales" | "uno" | "monto" | "porcentaje";
export type PaymentMethod =
  | "mercado_pago"
  | "transferencia"
  | "efectivo"
  | "qr_mercado_pago"
  | "tarjeta_debito"
  | "tarjeta_credito";
export type PaymentStatus = "definido" | "pendiente" | "pagado" | "cancelado";
export type TableSessionStatus = "abierta" | "pagada" | "cerrada";
export type BillRequestState = "abierta" | "dividiendo" | "lista" | "solicitada";
export type BillIntent = "total" | "dividir";

export const SPLIT_MODES: SplitMode[] = ["consumo", "iguales", "uno", "monto"];
export const GUEST_SHARE_MODES: SplitMode[] = ["consumo", "iguales", "monto", "porcentaje"];
export const PAYMENT_METHODS: PaymentMethod[] = [
  "mercado_pago",
  "transferencia",
  "efectivo",
  "qr_mercado_pago",
  "tarjeta_debito",
  "tarjeta_credito",
];
export const TIP_PERCENTS = [0, 5, 10, 15] as const;
export type TipPercent = (typeof TIP_PERCENTS)[number];

export interface BillItem {
  id: string;
  guestId: string;
  productId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface BillOrder {
  id: string;
  guestId: string | null;
  status: OrderStatus;
  createdAt: string;
  readyAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  items: BillItem[];
}

export interface BillGuest {
  id: string;
  name: string;
  joinedAt: string;
  consumption: number;
}

export interface BillPayment {
  id: string;
  guestId: string | null;
  payerName: string;
  mode: SplitMode;
  parts: number;
  base: number;
  tip: number;
  tipPercent: number | null;
  surcharge: number;
  surchargePercent: number;
  total: number;
  method: PaymentMethod;
  status: PaymentStatus;
  createdBy: "comensal" | "personal";
  confirmation: "manual" | "webhook" | null;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  expiresAt: string | null;
  mpStatus: string | null;
}

export interface BillTotals {
  consumption: number;
  tips: number;
  surcharges: number;
  total: number;
  paid: number;
  pendingConfirmation: number;
  paidBase: number;
  committedBase: number;
  committedParts: number;
  /* Consumption not yet covered by confirmed payments. 0 → table is paid. */
  uncovered: number;
  /* Consumption nobody has claimed yet (pending payments reserve theirs). */
  available: number;
}

export interface TableBill {
  session: {
    id: string;
    branchId: string;
    tableId: string | null;
    tableNumber: number;
    status: TableSessionStatus;
    splitMode: SplitMode | null;
    parts: number | null;
    version: number;
    openedAt: string;
    updatedAt: string;
    paidAt: string | null;
    closedAt: string | null;
    closeReason: string | null;
    calledAt: string | null;
    billState: BillRequestState;
    intent: BillIntent | null;
    requestedAt: string | null;
    requestedBy: string | null;
    fullPayerId: string | null;
    fullPayerName: string | null;
  };
  guests: BillGuest[];
  orders: BillOrder[];
  payments: BillPayment[];
  totals: BillTotals;
}

/* ---- JSON from _cuenta_json → camelCase ------------------------------- */

type Json = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => {
  if (typeof v === "string" && v) return v;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  return null;
};

export const mapBill = (raw: unknown): TableBill | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Json;
  const s = (r.sesion ?? {}) as Json;
  const t = (r.totales ?? {}) as Json;
  return {
    session: {
      id: str(s.id),
      branchId: str(s.local_id),
      tableId: strOrNull(s.mesa_id),
      tableNumber: num(s.mesa_numero),
      status: str(s.estado) as TableSessionStatus,
      splitMode: (strOrNull(s.modo_division) as SplitMode | null) ?? null,
      parts: s.partes == null ? null : num(s.partes),
      version: num(s.version),
      openedAt: str(s.abierta_en),
      updatedAt: str(s.actualizado_en),
      paidAt: strOrNull(s.pagada_en),
      closedAt: strOrNull(s.cerrada_en),
      closeReason: strOrNull(s.cerrada_motivo),
      calledAt: strOrNull(s.llamado_en),
      billState: (strOrNull(s.cuenta_estado) as BillRequestState | null) ?? "abierta",
      intent: (strOrNull(s.cuenta_intencion) as BillIntent | null) ?? null,
      requestedAt: strOrNull(s.cuenta_solicitada_en),
      requestedBy: strOrNull(s.cuenta_solicitada_por),
      fullPayerId: strOrNull(s.cuenta_pagador_total_id),
      fullPayerName: strOrNull(s.cuenta_pagador_total_nombre),
    },
    guests: ((r.comensales as Json[] | null) ?? []).map((c) => ({
      id: str(c.id),
      name: str(c.nombre),
      joinedAt: str(c.creado_en),
      consumption: num(c.consumo),
    })),
    orders: ((r.pedidos as Json[] | null) ?? []).map((p) => ({
      id: str(p.id),
      guestId: strOrNull(p.comensal_id),
      status: str(p.estado) as OrderStatus,
      createdAt: str(p.creado_en),
      readyAt: strOrNull(p.listo_en),
      deliveredAt: strOrNull(p.retirado_en),
      cancelledAt: strOrNull(p.cancelado_en),
      items: ((p.items as Json[] | null) ?? []).map((i) => ({
        id: str(i.id),
        guestId: str(i.comensal_id),
        productId: strOrNull(i.producto_id),
        name: str(i.nombre),
        unitPrice: num(i.precio_unitario),
        quantity: num(i.cantidad),
        subtotal: num(i.subtotal),
      })),
    })),
    payments: ((r.pagos as Json[] | null) ?? []).map((g) => ({
      id: str(g.id),
      guestId: strOrNull(g.comensal_id),
      payerName: str(g.pagador_nombre),
      mode: str(g.modo) as SplitMode,
      parts: num(g.partes),
      base: num(g.monto_base),
      tip: num(g.propina),
      tipPercent: g.propina_porcentaje == null ? null : num(g.propina_porcentaje),
      surcharge: num(g.recargo),
      surchargePercent: num(g.recargo_porcentaje),
      total: num(g.monto_total),
      method: str(g.metodo) as PaymentMethod,
      status: str(g.estado) as PaymentStatus,
      createdBy: str(g.creado_por) === "personal" ? "personal" : "comensal",
      confirmation: (strOrNull(g.confirmacion) as "manual" | "webhook" | null) ?? null,
      createdAt: str(g.creado_en),
      confirmedAt: strOrNull(g.confirmado_en),
      cancelledAt: strOrNull(g.cancelado_en),
      cancelReason: strOrNull(g.cancelado_motivo),
      expiresAt: strOrNull(g.expira_en),
      mpStatus: strOrNull(g.mp_estado),
    })),
    totals: {
      consumption: num(t.consumo),
      tips: num(t.propinas),
      surcharges: num(t.recargos),
      total: num(t.total),
      paid: num(t.pagado),
      pendingConfirmation: num(t.pendiente_confirmar),
      paidBase: num(t.base_pagada),
      committedBase: num(t.base_comprometida),
      committedParts: num(t.partes_comprometidas),
      uncovered: num(t.falta_cubrir),
      available: num(t.disponible),
    },
  };
};

/* ---- Payment settings ------------------------------------------------- */

export interface PaymentSettings {
  mercadoPago: boolean;
  transfer: boolean;
  cash: boolean;
  mpQr: boolean;
  debit: boolean;
  credit: boolean;
  transferAlias: string | null;
  transferHolder: string | null;
  transferCbu: string | null;
  debitSurchargePct: number;
  creditSurchargePct: number;
  surchargeDeclared: boolean;
}

/* Same defaults as a branch without a local_cobros row. */
export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  mercadoPago: false,
  transfer: false,
  cash: true,
  mpQr: false,
  debit: true,
  credit: true,
  transferAlias: null,
  transferHolder: null,
  transferCbu: null,
  debitSurchargePct: 0,
  creditSurchargePct: 0,
  surchargeDeclared: false,
};

export const mapPaymentSettings = (row: Json | null | undefined): PaymentSettings =>
  row
    ? {
        mercadoPago: Boolean(row.acepta_mercado_pago),
        transfer: Boolean(row.acepta_transferencia),
        cash: Boolean(row.acepta_efectivo),
        mpQr: Boolean(row.acepta_qr_mercado_pago),
        debit: Boolean(row.acepta_debito),
        credit: Boolean(row.acepta_credito),
        transferAlias: strOrNull(row.transferencia_alias),
        transferHolder: strOrNull(row.transferencia_titular),
        transferCbu: strOrNull(row.transferencia_cbu),
        debitSurchargePct: num(row.recargo_debito_pct),
        creditSurchargePct: num(row.recargo_credito_pct),
        surchargeDeclared: Boolean(row.recargo_declarado),
      }
    : { ...DEFAULT_PAYMENT_SETTINGS };

export const enabledMethods = (
  s: PaymentSettings,
  opts: { mercadoPagoConnected: boolean; forStaff?: boolean },
): PaymentMethod[] =>
  PAYMENT_METHODS.filter((m) => {
    if (m === "mercado_pago") {
      return !opts.forStaff && s.mercadoPago && opts.mercadoPagoConnected;
    }
    if (m === "transferencia") return s.transfer;
    if (m === "efectivo") return s.cash;
    if (m === "qr_mercado_pago") return s.mpQr;
    if (m === "tarjeta_debito") return s.debit;
    return s.credit;
  });

export const surchargePercentFor = (
  s: PaymentSettings,
  method: PaymentMethod,
): number =>
  method === "tarjeta_debito"
    ? s.debitSurchargePct
    : method === "tarjeta_credito"
      ? s.creditSurchargePct
      : 0;

/* ---- Payment preview (mirror of _crear_pago_mesa) --------------------- */

export interface PaymentDraft {
  mode: SplitMode;
  method: PaymentMethod;
  /* iguales: how many parts this payment covers (default 1). */
  parts?: number;
  /* iguales, first payment only: total parts of the table. */
  totalParts?: number;
  /* monto / porcentaje: either a fixed amount or a percentage of consumption. */
  amount?: number | null;
  percent?: number | null;
  tipPercent?: TipPercent | null;
  tipAmount?: number | null;
}

export type PreviewReason =
  | "mesa-cerrada"
  | "modo-bloqueado"
  | "partes-invalidas"
  | "nada-que-pagar"
  | "comensal-requerido"
  | "porcentaje-invalido"
  | "monto-invalido"
  | "excede"
  | "propina-invalida";

export type PaymentPreview =
  | {
      ok: true;
      base: number;
      tip: number;
      surcharge: number;
      surchargePercent: number;
      total: number;
      parts: number;
      totalParts: number | null;
      /* Consumption still uncovered after this payment (not including tip). */
      remaining: number;
    }
  | { ok: false; reason: PreviewReason; available?: number };

/* "¿Entre cuántos?" / "¿Cuántas partes?": empty while typing is valid. */
export const parsePartCount = (raw: string): number | null => {
  if (!raw.trim()) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1 || n > 50) return null;
  return n;
};

/* Postgres round() on numeric rounds half away from zero; every amount here
 * is positive, where Math.round does the same. */
const pgRound = (n: number): number => Math.round(n);

export const activePayments = (bill: TableBill): BillPayment[] =>
  bill.payments.filter((p) => p.status !== "cancelado");

/* Amounts collected by staff at the venue don't fix or block the table's
 * split mode (same rule as _crear_pago_mesa). */
const isStaffAmount = (p: Pick<BillPayment, "createdBy" | "mode">): boolean =>
  p.createdBy === "personal" && (p.mode === "monto" || p.mode === "uno");

export const splitModeLocked = (bill: TableBill): boolean =>
  bill.session.splitMode !== null &&
  activePayments(bill).some((p) => !isStaffAmount(p));

export type BillStatus = "pagada" | "parcial" | "pendiente" | "sin-consumo" | "cerrada";

/* Traffic light for the cobros list. "Paid" means confirmed consumption covers
 * the bill; a pending cash or transfer payment doesn't count yet. */
export const billStatus = (bill: TableBill): BillStatus => {
  if (bill.session.status === "pagada") return "pagada";
  if (bill.session.status === "cerrada") return "cerrada";
  if (bill.totals.consumption <= 0) return "sin-consumo";
  if (bill.totals.uncovered <= 0) return "pagada";
  return bill.totals.paidBase > 0 ? "parcial" : "pendiente";
};

/* What's still owed including tips already added to payments. */
export const billPending = (bill: TableBill): number =>
  Math.max(bill.totals.total - bill.totals.paid, 0);

export const previewPayment = (
  bill: TableBill,
  guestId: string | null,
  draft: PaymentDraft,
  settings: PaymentSettings,
  now: Date = new Date(),
  actor: "comensal" | "personal" = "comensal",
  opts: { lockMode?: boolean } = {},
): PaymentPreview => {
  if (bill.session.status !== "abierta") return { ok: false, reason: "mesa-cerrada" };
  if (bill.session.requestedAt && actor === "comensal") {
    return { ok: false, reason: "mesa-cerrada" };
  }
  const presencial = actor === "personal" && (draft.mode === "monto" || draft.mode === "uno");
  const lockMode = opts.lockMode !== false && !presencial;

  /* Expired MP reservations are released server-side before computing. */
  const active = bill.payments.filter(
    (p) =>
      p.status !== "cancelado" &&
      !(
        p.method === "mercado_pago" &&
        p.status === "pendiente" &&
        p.expiresAt &&
        new Date(p.expiresAt).getTime() < now.getTime() &&
        !bill.session.requestedAt
      ),
  );

  const guestActive = active.filter((p) => !isStaffAmount(p));
  let totalParts = bill.session.parts;
  if (lockMode && guestActive.length > 0 && bill.session.splitMode !== null) {
    if (
      bill.session.splitMode !== draft.mode ||
      (draft.mode === "iguales" &&
        draft.totalParts !== undefined &&
        draft.totalParts !== bill.session.parts)
    ) {
      return { ok: false, reason: "modo-bloqueado" };
    }
  }
  if (lockMode && guestActive.length === 0) {
    if (draft.mode === "iguales") {
      totalParts = draft.totalParts ?? bill.guests.length;
      if (!Number.isInteger(totalParts) || totalParts < 1 || totalParts > 50) {
        return { ok: false, reason: "partes-invalidas" };
      }
    } else {
      totalParts = null;
    }
  } else if (draft.mode === "iguales") {
    totalParts = draft.totalParts ?? bill.session.parts ?? bill.guests.length;
    if (!Number.isInteger(totalParts) || totalParts < 1 || totalParts > 50) {
      return { ok: false, reason: "partes-invalidas" };
    }
  }

  const consumption = bill.totals.consumption;
  const committed = active.reduce((s, p) => s + p.base, 0);
  const committedParts = active
    .filter((p) => p.mode === "iguales")
    .reduce((s, p) => s + p.parts, 0);
  const available = Math.max(consumption - committed, 0);
  if (available <= 0) return { ok: false, reason: "nada-que-pagar" };

  let parts = 1;
  let base: number;

  if (draft.mode === "consumo") {
    if (!guestId) return { ok: false, reason: "comensal-requerido" };
    const mine =
      bill.guests.find((g) => g.id === guestId)?.consumption ?? 0;
    const mineCommitted = active
      .filter((p) => p.guestId === guestId)
      .reduce((s, p) => s + p.base, 0);
    base = Math.min(Math.max(mine - mineCommitted, 0), available);
  } else if (draft.mode === "iguales") {
    parts = Math.max(1, Math.min(50, Math.trunc(draft.parts ?? 1)));
    if (!lockMode) {
      const n = totalParts ?? 1;
      base = Math.min(Math.floor(consumption / n) * parts, available);
    } else {
      const remaining = (totalParts ?? 1) - committedParts;
      if (remaining <= 0) {
        base = available;
        parts = 1;
      } else if (parts >= remaining) {
        parts = remaining;
        base = available;
      } else {
        base = Math.floor(available / remaining) * parts;
      }
    }
  } else if (draft.mode === "uno") {
    base = available;
  } else if (draft.mode === "porcentaje") {
    if (draft.percent == null || !(draft.percent > 0 && draft.percent <= 100)) {
      return { ok: false, reason: "porcentaje-invalido" };
    }
    base = pgRound((consumption * draft.percent) / 100);
    if (base > available) return { ok: false, reason: "excede", available };
  } else {
    if (draft.amount != null) {
      base = Math.trunc(draft.amount);
    } else if (draft.percent != null) {
      if (!(draft.percent > 0 && draft.percent <= 100)) {
        return { ok: false, reason: "porcentaje-invalido" };
      }
      base = pgRound((consumption * draft.percent) / 100);
    } else {
      return { ok: false, reason: "monto-invalido" };
    }
    if (base > available) return { ok: false, reason: "excede", available };
  }

  if (!(base > 0)) return { ok: false, reason: "nada-que-pagar" };

  let tip = 0;
  if (draft.tipPercent != null && draft.tipPercent !== 0) {
    if (![5, 10, 15].includes(draft.tipPercent)) {
      return { ok: false, reason: "propina-invalida" };
    }
    tip = pgRound((base * draft.tipPercent) / 100);
  } else if (draft.tipPercent == null && draft.tipAmount != null) {
    tip = Math.trunc(draft.tipAmount);
    if (tip < 0 || tip > base) return { ok: false, reason: "propina-invalida" };
  }

  const surchargePercent = surchargePercentFor(settings, draft.method);
  const surcharge = surchargePercent > 0 ? pgRound((base * surchargePercent) / 100) : 0;

  return {
    ok: true,
    base,
    tip,
    surcharge,
    surchargePercent,
    total: base + tip + surcharge,
    parts,
    totalParts,
    remaining: available - base,
  };
};

export const withoutGuestDraft = (bill: TableBill, guestId: string): TableBill => {
  const payments = bill.payments.filter(
    (p) => !(p.guestId === guestId && p.createdBy === "comensal" && p.status === "definido"),
  );
  const committed = payments.filter((p) => p.status !== "cancelado").reduce((s, p) => s + p.base, 0);
  return {
    ...bill,
    payments,
    totals: {
      ...bill.totals,
      committedBase: committed,
      available: Math.max(bill.totals.consumption - committed, 0),
    },
  };
};

/* Mix of modes is allowed while defining. The guest's current draft is replaced. */
export const previewGuestShare = (
  bill: TableBill,
  guestId: string,
  draft: PaymentDraft,
  settings: PaymentSettings,
): PaymentPreview =>
  previewPayment(withoutGuestDraft(bill, guestId), guestId, draft, settings, new Date(), "comensal", {
    lockMode: false,
  });

export const payAllBase = (bill: TableBill): number => {
  const drafts = bill.payments
    .filter((p) => p.createdBy === "comensal" && p.status === "definido")
    .reduce((s, p) => s + p.base, 0);
  return bill.totals.available + drafts;
};

export const previewPayAll = (
  bill: TableBill,
  guestId: string,
  draft: Omit<PaymentDraft, "mode">,
  settings: PaymentSettings,
): PaymentPreview =>
  previewPayment(
    {
      ...bill,
      payments: bill.payments.filter((p) => !(p.createdBy === "comensal" && p.status === "definido")),
    },
    guestId,
    { ...draft, mode: "uno" },
    settings,
    new Date(),
    "comensal",
    { lockMode: false },
  );

export const myDefinedPayment = (bill: TableBill, guestId: string): BillPayment | null =>
  bill.payments.find(
    (p) => p.guestId === guestId && p.createdBy === "comensal" && p.status === "definido",
  ) ?? null;

export const billRequested = (bill: TableBill): boolean =>
  Boolean(bill.session.requestedAt) || bill.session.billState === "solicitada";

/* ---- Views ------------------------------------------------------------ */

export interface GuestConsumption {
  guest: BillGuest;
  lines: { name: string; unitPrice: number; quantity: number; subtotal: number }[];
  subtotal: number;
}

/* "Pedido / Consumo": what each person ordered, merged by product and price
 * (ordering the same thing twice shows one line with quantity 2). Cancelled
 * orders are left out, like in the totals. */
export const consumptionByGuest = (bill: TableBill): GuestConsumption[] =>
  bill.guests.map((guest) => {
    const merged = new Map<string, GuestConsumption["lines"][number]>();
    for (const order of bill.orders) {
      if (order.status === "cancelado") continue;
      for (const item of order.items) {
        if (item.guestId !== guest.id) continue;
        const key = `${item.productId ?? item.name}:${item.unitPrice}`;
        const prev = merged.get(key);
        if (prev) {
          prev.quantity += item.quantity;
          prev.subtotal += item.subtotal;
        } else {
          merged.set(key, {
            name: item.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            subtotal: item.subtotal,
          });
        }
      }
    }
    const lines = [...merged.values()];
    return {
      guest,
      lines,
      subtotal: lines.reduce((s, l) => s + l.subtotal, 0),
    };
  });

export interface PayerSummary {
  key: string;
  name: string;
  guestId: string | null;
  payments: BillPayment[];
  paid: number;
  pending: number;
}

/* "Cuenta / Pagos": who paid what, grouped by person. Guests with no payment
 * yet still show up, so the table sees who's missing. */
export const paymentsByPayer = (bill: TableBill): PayerSummary[] => {
  const out = new Map<string, PayerSummary>();
  for (const g of bill.guests) {
    out.set(g.id, { key: g.id, name: g.name, guestId: g.id, payments: [], paid: 0, pending: 0 });
  }
  for (const p of bill.payments) {
    const key = p.guestId ?? `extra:${p.payerName.toLowerCase()}`;
    const row =
      out.get(key) ??
      { key, name: p.payerName, guestId: p.guestId, payments: [], paid: 0, pending: 0 };
    row.payments.push(p);
    if (p.status === "pagado") row.paid += p.total;
    if (p.status === "pendiente" || p.status === "definido") row.pending += p.total;
    out.set(key, row);
  }
  return [...out.values()];
};

export const formatMoney = (n: number): string =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

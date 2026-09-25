import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TableGuestApp } from "@/components/customer/table/TableGuestApp";
import { TableNotFound } from "@/components/customer/table/TableNotFound";
import { TablePickupApp } from "@/components/customer/table/TablePickupApp";
import { qrTokenSchema, uuid } from "@/lib/schemas";
import { guestSessionHere } from "@/lib/guestSession";
import {
  fetchGuestPaymentOptions,
  fetchGuestState,
  fetchMenu,
  fetchBranchBrand,
  readGuestCookie,
  resolveTableQr,
  type GuestCredentials,
} from "@/lib/server/tableGuest";
import {
  fetchPickupState,
  resolveCounterQr,
  resolvePickupAccess,
} from "@/lib/server/tablePickup";
import { counterPayOptions, type PickupFlow } from "@/lib/tablePickup";

/* Table QR landing. Rendered on the server with everything resolved: the
 * first HTML already has the menu and, for a returning guest, the bill. */
export const dynamic = "force-dynamic";

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> => {
  const { token } = await params;
  if (!qrTokenSchema.safeParse(token).success) {
    return { robots: { index: false, follow: false } };
  }
  const mesa = await resolveTableQr(token);
  if (!mesa.ok) {
    const counter = await resolveCounterQr(token);
    return {
      robots: { index: false, follow: false },
      title: counter.ok ? counter.branchName || "Cicalino" : "Cicalino",
    };
  }
  return {
    robots: { index: false, follow: false },
    title: `${mesa.branchName} · Mesa ${mesa.tableNumber}`,
  };
};

const TablePage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ pago?: string }>;
}) => {
  const { token } = await params;
  const { pago } = await searchParams;

  if (!qrTokenSchema.safeParse(token).success) return <TableNotFound />;

  const [mesa, creds] = await Promise.all([resolveTableQr(token), readGuestCookie()]);

  /* Pedidos en modalidad Mesa: el mismo QR, otro flujo. Pedir, pagar y
   * retirar en el mostrador; sin cuenta compartida. */
  if (mesa.ok && mesa.flow === "autoservicio") {
    return (
      <PickupPage
        token={token}
        qr={{ ...mesa, flow: "autoservicio" }}
        creds={creds}
        pago={pago}
      />
    );
  }

  /* Pedidos en modalidad Mostrador QR: un QR para todo el local. El token no
   * es de una mesa; el pedido de cada teléfono sale de su cookie. Un cartel
   * regenerado ya no inicia pedidos, pero quien ya pidió con él sigue viendo
   * (y pagando) lo suyo ahí mismo: sin redirigir al QR nuevo. */
  if (!mesa.ok) {
    const counter = await resolvePickupAccess(token, creds);
    if (counter.ok && counter.flow === "mostrador_qr") {
      return (
        <PickupPage
          token={token}
          qr={{ ...counter, tableNumber: null }}
          creds={creds}
          pago={pago}
        />
      );
    }
  }

  const state = await fetchGuestState(creds);

  if (!mesa.ok) {
    /* An old printed QR (regenerated since) still works for someone already
     * sitting at the table: send them to the current one. A seated guest also
     * keeps their session if the QR was turned off after they joined. */
    if (state.ok && state.bill.session.status === "abierta") {
      if (state.tableToken && state.tableToken !== token) {
        redirect(`/m/${state.tableToken}`);
      }
      if (state.tableToken === token && state.bill.session.tableId) {
        const [menu, payment, brand] = await Promise.all([
          fetchMenu(state.bill.session.branchId),
          fetchGuestPaymentOptions(state.bill.session.branchId),
          fetchBranchBrand(state.bill.session.branchId),
        ]);
        return (
          <TableGuestApp
            initial={{
              token,
              tableNumber: state.bill.session.tableNumber,
              branchName: brand.name,
              logoUrl: brand.logoUrl,
              colorMarca: brand.color,
              operational: true,
              menu,
              settings: payment.settings,
              mercadoPagoReady: payment.mercadoPagoReady,
              guest: { id: state.guest.id, name: state.guest.name },
              bill: state.bill,
              returningPaymentId: uuid.safeParse(pago).success ? pago! : null,
            }}
          />
        );
      }
    }
    return <TableNotFound reason={mesa.reason} />;
  }

  const [menu, payment, brand] = await Promise.all([
    fetchMenu(mesa.branchId),
    fetchGuestPaymentOptions(mesa.branchId),
    fetchBranchBrand(mesa.branchId),
  ]);

  /* Same phone, same table, account still open: skip the name form. A paid
   * or closed session (or a guest from another table) joins again. */
  const here = state.ok && guestSessionHere(state.bill.session, mesa.tableId);

  return (
    <TableGuestApp
      initial={{
        token,
        tableNumber: mesa.tableNumber,
        branchName: brand.name || mesa.branchName,
        logoUrl: brand.logoUrl,
        colorMarca: brand.color,
        operational: mesa.operational,
        menu,
        settings: payment.settings,
        mercadoPagoReady: payment.mercadoPagoReady,
        guest: here && state.ok ? { id: state.guest.id, name: state.guest.name } : null,
        bill: here && state.ok ? state.bill : null,
        returningPaymentId: uuid.safeParse(pago).success ? pago! : null,
      }}
    />
  );
};

const PickupPage = async ({
  token,
  qr,
  creds,
  pago,
}: {
  token: string;
  qr: {
    flow: PickupFlow;
    branchId: string;
    branchName: string;
    operational: boolean;
    tableNumber: number | null;
  };
  creds: GuestCredentials | null;
  pago: string | undefined;
}) => {
  const [menu, payment, brand, pickup] = await Promise.all([
    fetchMenu(qr.branchId),
    fetchGuestPaymentOptions(qr.branchId),
    fetchBranchBrand(qr.branchId),
    fetchPickupState(token, creds, qr.flow),
  ]);
  const mercadoPagoReady = payment.mercadoPagoReady && payment.settings.mercadoPago;
  /* En la mesa "pagar en caja" se ofrece como siempre; en el mostrador sale
   * de los métodos que el local tiene habilitados. */
  const cashReady =
    qr.flow === "mostrador_qr"
      ? counterPayOptions(payment.settings, mercadoPagoReady).caja
      : true;
  return (
    <TablePickupApp
      initial={{
        token,
        flow: qr.flow,
        tableNumber: qr.tableNumber,
        branchName: brand.name || qr.branchName,
        logoUrl: brand.logoUrl,
        colorMarca: brand.color,
        operational: qr.operational,
        menu,
        mercadoPagoReady,
        cashReady,
        state: pickup.ok ? pickup.state : null,
        returningPaymentId: uuid.safeParse(pago).success ? pago! : null,
      }}
    />
  );
};

export default TablePage;

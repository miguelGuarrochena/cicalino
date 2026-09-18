import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TableGuestApp } from "@/components/customer/table/TableGuestApp";
import { TableNotFound } from "@/components/customer/table/TableNotFound";
import { qrTokenSchema, uuid } from "@/lib/schemas";
import { guestSessionHere } from "@/lib/guestSession";
import {
  fetchGuestPaymentOptions,
  fetchGuestState,
  fetchMenu,
  fetchBranchBrand,
  readGuestCookie,
  resolveTableQr,
} from "@/lib/server/tableGuest";

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
  return {
    robots: { index: false, follow: false },
    title: mesa.ok ? `${mesa.branchName} · Mesa ${mesa.tableNumber}` : "Cicalino",
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

  const [mesa, state] = await Promise.all([
    resolveTableQr(token),
    readGuestCookie().then(fetchGuestState),
  ]);

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

export default TablePage;

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TableGuestApp } from "@/components/customer/table/TableGuestApp";
import { TableNotFound } from "@/components/customer/table/TableNotFound";
import { qrTokenSchema, uuid } from "@/lib/schemas";
import {
  fetchGuestPaymentOptions,
  fetchGuestState,
  fetchMenu,
  readGuestCookie,
  resolveTableQr,
} from "@/lib/server/tableGuest";

/* Table QR landing. Rendered on the server with everything resolved: the
 * first HTML already has the menu and, for a returning guest, the bill. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
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
     * sitting at the table: send them to the current one. */
    if (state.ok && state.tableToken && state.bill.session.status === "abierta") {
      redirect(`/m/${state.tableToken}`);
    }
    return <TableNotFound reason={mesa.reason} />;
  }

  const [menu, payment] = await Promise.all([
    fetchMenu(mesa.branchId),
    fetchGuestPaymentOptions(mesa.branchId),
  ]);

  /* The cookie belongs to this table only if it points to it. A guest from
   * yesterday's session or another table joins again. */
  const here =
    state.ok &&
    state.tableToken === token &&
    state.bill.session.tableId === mesa.tableId;

  return (
    <TableGuestApp
      initial={{
        token,
        tableNumber: mesa.tableNumber,
        branchName: mesa.branchName,
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

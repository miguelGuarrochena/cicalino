import type { Metadata } from "next";
import { after } from "next/server";
import { CustomerWaiting } from "@/components/customer/CustomerWaiting";
import {
  fetchCustomerOrderFull,
  markCustomerOrderSeen,
} from "@/lib/data/customer-order";
import { qrTokenSchema } from "@/lib/schemas";
import type { InitialCustomerOrder } from "@/lib/hooks/useCustomerOrder";

/* La pantalla del cliente se renderiza en el servidor con el pedido ya
 * resuelto: el primer HTML que llega al teléfono ya trae el número y el
 * estado. El polling arranca después, solo para mantenerlo sincronizado. */
export const dynamic = "force-dynamic";

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> => {
  const { token } = await params;
  const valido = qrTokenSchema.safeParse(token).success;
  return {
    robots: { index: false, follow: false },
    // Manifest propio del pedido: si alguien agrega la pantalla a su inicio,
    // tiene que abrirse en su pedido y no en el panel del local.
    ...(valido ? { manifest: `/p/${token}/manifest.webmanifest` } : {}),
  };
};

const CustomerPage = async ({
  params,
}: {
  params: Promise<{ token: string }>;
}) => {
  const { token } = await params;

  if (!qrTokenSchema.safeParse(token).success) {
    return <CustomerWaiting token={token} initial={{ kind: "not-found" }} />;
  }

  const res = await fetchCustomerOrderFull(token);

  let initial: InitialCustomerOrder;
  if (res.ok) {
    initial = { kind: "ok", order: res.order };
    if (!res.seen) {
      // Fuera del camino crítico: el cliente no espera este UPDATE.
      after(() => markCustomerOrderSeen(res.id));
    }
  } else if (res.reason === "not-configured") {
    // Sin Supabase (demo local): que resuelva el cliente contra su store.
    initial = { kind: "unknown" };
  } else {
    initial = { kind: "not-found" };
  }

  return <CustomerWaiting token={token} initial={initial} />;
};

export default CustomerPage;

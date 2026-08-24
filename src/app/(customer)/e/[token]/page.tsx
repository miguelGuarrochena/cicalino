import type { Metadata } from "next";
import { after } from "next/server";
import { CustomerEsperaWaiting } from "@/components/customer/CustomerEsperaWaiting";
import {
  fetchCustomerEsperaSeen,
  markCustomerEsperaSeen,
} from "@/lib/data/customer-espera";
import { qrTokenSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const CustomerEsperaPage = async ({
  params,
}: {
  params: Promise<{ token: string }>;
}) => {
  const { token } = await params;

  if (qrTokenSchema.safeParse(token).success) {
    const res = await fetchCustomerEsperaSeen(token);
    if (res.ok) {
      after(() => markCustomerEsperaSeen(res.id, "visit"));
    }
  }

  return <CustomerEsperaWaiting token={token} />;
};

export default CustomerEsperaPage;

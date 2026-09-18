import type { Metadata } from "next";
import { after } from "next/server";
import { CustomerEsperaWaiting } from "@/components/customer/CustomerEsperaWaiting";
import {
  fetchCustomerEsperaSeen,
  fetchCustomerEsperaBrand,
  markCustomerEsperaSeen,
} from "@/lib/data/customer-espera";
import { emptyCustomerBrand } from "@/lib/customerBrand";
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
  let brand = emptyCustomerBrand();

  if (qrTokenSchema.safeParse(token).success) {
    const [res, nextBrand] = await Promise.all([
      fetchCustomerEsperaSeen(token),
      fetchCustomerEsperaBrand(token),
    ]);
    brand = nextBrand;
    if (res.ok) {
      after(() => markCustomerEsperaSeen(res.id, "visit"));
    }
  }

  return <CustomerEsperaWaiting token={token} brand={brand} />;
};

export default CustomerEsperaPage;

import type { Metadata } from "next";
import { CustomerEsperaWaiting } from "@/components/customer/CustomerEsperaWaiting";

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
  return <CustomerEsperaWaiting token={token} />;
};

export default CustomerEsperaPage;

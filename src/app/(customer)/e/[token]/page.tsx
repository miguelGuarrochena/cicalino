import { CustomerEsperaWaiting } from "@/components/customer/CustomerEsperaWaiting";

const CustomerEsperaPage = async ({
  params,
}: {
  params: Promise<{ token: string }>;
}) => {
  const { token } = await params;
  return <CustomerEsperaWaiting token={token} />;
};

export default CustomerEsperaPage;

import { CustomerWaiting } from "@/components/customer/CustomerWaiting";

// Vista publica del cliente: cicalino.ar/p/[token]
// El token viaja en el QR y expira a fin del dia. En produccion validamos
// el token contra la base antes de renderizar; si expiro, mostramos aviso.
const CustomerPage = async ({
  params,
}: {
  params: Promise<{ token: string }>;
}) => {
  const { token } = await params;
  return <CustomerWaiting token={token} />;
};
export default CustomerPage;

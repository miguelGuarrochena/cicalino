import { EsperaCliente } from "@/components/cliente/EsperaCliente";

// Vista publica del cliente: cicalino.ar/p/[token]
// El token viaja en el QR y expira a fin del dia. En produccion validamos
// el token contra la base antes de renderizar; si expiro, mostramos aviso.
const ClientePage = async ({
  params,
}: {
  params: Promise<{ token: string }>;
}) => {
  const { token } = await params;
  return <EsperaCliente token={token} />;
};
export default ClientePage;

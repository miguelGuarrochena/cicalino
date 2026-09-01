import type { Metadata } from "next";
import { PasswordResetForm } from "@/components/auth/PasswordResetForm";

/* El token viaja en la query, así que la página se arma en cada request.
 * Sin token muestra el pedido del link; con token, el formulario de la
 * contraseña nueva. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recuperar contraseña · Cicalino",
  robots: { index: false, follow: false },
};

const RecuperarPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) => {
  const { token } = await searchParams;
  const valor = Array.isArray(token) ? token[0] : token;
  return <PasswordResetForm token={valor?.trim() || null} />;
};

export default RecuperarPage;

import type { Metadata } from "next";
import { Showroom } from "@/components/showroom/Showroom";

/* La presentación para la primera visita a un local. Es una herramienta de
 * venta para usar en persona, no una página del sitio: fuera del índice y del
 * sitemap. Ver docs/como-funciona.md. */
export const metadata: Metadata = {
  title: "Cicalino: cómo funciona",
  description: "Cicalino conecta el celular de tu cliente con tu local. Con un QR.",
  robots: { index: false, follow: false },
};

const ComoFunciona = () => <Showroom />;
export default ComoFunciona;

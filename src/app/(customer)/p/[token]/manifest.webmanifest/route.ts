import { NextResponse } from "next/server";
import { qrTokenSchema } from "@/lib/schemas";

/* Manifest por pedido.
 *
 * El manifest global apunta a /panel, que es la app del local. Si un cliente
 * agrega la pantalla de su pedido a la pantalla de inicio, tiene que abrirse
 * en su pedido, no en el panel. Por eso cada token sirve el suyo. */
export const dynamic = "force-dynamic";

export const GET = async (
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  if (!qrTokenSchema.safeParse(token).success) {
    return new NextResponse("not found", { status: 404 });
  }

  return NextResponse.json(
    {
      name: "Cicalino — tu pedido",
      short_name: "Mi pedido",
      lang: "es-AR",
      dir: "ltr",
      start_url: `/p/${token}`,
      scope: `/p/${token}`,
      display: "standalone",
      orientation: "portrait-primary",
      background_color: "#f4f1da",
      theme_color: "#2536d4",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        {
          src: "/icon-192-maskable.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "maskable",
        },
        {
          src: "/icon-512-maskable.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    {
      headers: {
        "content-type": "application/manifest+json",
        "cache-control": "private, max-age=0, must-revalidate",
      },
    },
  );
};

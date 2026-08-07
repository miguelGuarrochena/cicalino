import type { Metadata, Viewport } from "next";
import { Archivo, Archivo_Black } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { ToastProvider } from "@/components/ui/Toast";

/* Auto-hospedadas por next/font: se descargan en el build y salen de nuestro
 * dominio. Antes venían de Google con dos preconnect y una hoja de estilos que
 * bloquea el render, y eso además obligaba a listar los dos hosts de Google en
 * la CSP.
 *
 * `display: swap` mantiene lo que ya hacía la URL de Google: el texto se ve
 * con la tipografía de sistema hasta que llega la nuestra, en vez de quedar
 * invisible. */
const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--fuente-archivo",
});

const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--fuente-archivo-black",
});

export const metadata: Metadata = {
  title: "Cicalino: avisamos el momento justo",
  description:
    "El avisador de pedidos por QR para tu negocio gastronomico. Sin buzzers, sin apps: el cliente escanea un QR y le avisas cuando esta listo.",
  applicationName: "Cicalino",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Cicalino",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: "Cicalino",
    title: "Cicalino: avisamos el momento justo",
    description:
      "El avisador de pedidos por QR para tu negocio gastronomico. Sin buzzers, sin apps.",
    locale: "es_AR",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1da" },
    { media: "(prefers-color-scheme: dark)", color: "#10142f" },
  ],
  width: "device-width",
  initialScale: 1,
};

const RootLayout = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  return (
    <html
      lang="es-AR"
      className={`${archivo.variable} ${archivoBlack.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Has to be blocking: it sets the theme before the first paint, and
            deferring it brings back the white flash on every load. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
      </head>
      <body>
        <a href="#contenido" className="skip-link">
          Saltar al contenido
        </a>
        <Providers>
          <ToastProvider>
            <div id="contenido">{children}</div>
          </ToastProvider>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
};
export default RootLayout;

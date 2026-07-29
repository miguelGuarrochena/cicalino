import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { ToastProvider } from "@/components/ui/Toast";

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
  // Los iconos se resuelven solos desde app/favicon.ico, app/icon.png y
  // app/apple-icon.png (convencion de Next).
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
    <html lang="es-AR" suppressHydrationWarning>
      <head>
        {/* Anti-flash de tema. Externo (no inline) para que la CSP pueda
            prohibir scripts inline sin excepciones. */}
        <script src="/theme-init.js" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Archivo+Black&display=swap"
          rel="stylesheet"
        />
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

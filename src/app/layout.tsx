import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "Cicalino — avisamos el momento justo",
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
    title: "Cicalino — avisamos el momento justo",
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

// Evita el flash de tema: aplica data-theme antes de pintar.
const noFlash = `(function(){try{var t=localStorage.getItem('cicalino-theme');if(t&&t!=='system')document.documentElement.setAttribute('data-theme',t);var l=localStorage.getItem('cicalino-lang');if(l)document.documentElement.lang=l==='en'?'en':'es-AR';}catch(e){}})();`;

const RootLayout = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
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
      </body>
    </html>
  );
};
export default RootLayout;

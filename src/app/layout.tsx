import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";

export const metadata: Metadata = {
  title: "Cicalino — avisamos el momento justo",
  description:
    "El avisador de pedidos por QR para tu negocio gastronomico. Sin buzzers, sin apps: el cliente escanea un QR y le avisas cuando esta listo.",
  applicationName: "Cicalino",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png", sizes: "256x256" },
    ],
    apple: "/apple-touch-icon.png",
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
};
export default RootLayout;

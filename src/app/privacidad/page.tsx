"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Controls } from "@/components/ui/Controls";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { useApp } from "@/components/providers/Providers";

const PrivacidadPage = () => {
  const { t, locale } = useApp();
  const es = locale !== "en";

  return (
    <div className="flex min-h-dvh flex-col bg-crema">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo className="h-10 sm:h-12" />
        <Controls />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 prose-like">
        <Link href="/" className="text-xs font-semibold text-marca hover:underline">
          ← Cicalino
        </Link>
        <h1 className="mt-4 font-display text-4xl uppercase tracking-tight text-carbon">
          {t("nav.privacidad")}
        </h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-carbon/70">
          {es ? (
            <>
              <p>
                Cicalino trata los datos del negocio (local, empleados, pedidos) y
                las suscripciones Web Push del cliente solo para operar el aviso
                de pedidos.
              </p>
              <p>
                No vendemos datos. El cliente no crea cuenta: solo escanea un QR
                temporal. Los tokens de QR expiran al final del día.
              </p>
              <p>
                Para ejercer derechos o consultas: escribinos desde el contacto
                del local o a través de{" "}
                <a
                  href="https://miguelguarrochena.dev"
                  className="font-semibold text-marca hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  miguelguarrochena.dev
                </a>
                .
              </p>
            </>
          ) : (
            <>
              <p>
                Cicalino processes business data (venue, staff, orders) and
                customer Web Push subscriptions only to run order notices.
              </p>
              <p>
                We don’t sell data. Customers don’t create accounts: they scan a
                temporary QR. QR tokens expire at end of day.
              </p>
              <p>
                For requests, contact via the venue or{" "}
                <a
                  href="https://miguelguarrochena.dev"
                  className="font-semibold text-marca hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  miguelguarrochena.dev
                </a>
                .
              </p>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};
export default PrivacidadPage;

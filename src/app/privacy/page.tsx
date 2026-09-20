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
                Cicalino trata los datos del negocio (local, empleados, pedidos,
                esperas y cobros) y las suscripciones Web Push del cliente solo
                para operar el servicio contratado.
              </p>
              <p>
                No vendemos datos. El cliente no crea cuenta: solo escanea un QR.
                Los pedidos, esperas y cobros quedan en el historial del local
                para métricas y operación: no se borran al corte de jornada. Lo
                que deja de funcionar es el token de ese QR, para que el aviso
                no siga activo.
              </p>
              <p>
                Para ejercer derechos o consultas, escribinos a{" "}
                <a
                  href="mailto:info@cicalino.net"
                  className="font-semibold text-marca hover:underline"
                >
                  info@cicalino.net
                </a>
                .
              </p>
            </>
          ) : (
            <>
              <p>
                Cicalino processes business data (venue, staff, orders, waitlist
                and payments) and customer Web Push subscriptions only to run
                the contracted service.
              </p>
              <p>
                We don’t sell data. Customers don’t create accounts: they scan a
                QR. Orders, waitlist entries and payments stay in the venue’s
                history for metrics and operations: they are not deleted at
                business-day cutover. What expires is that QR token, so notices
                stop.
              </p>
              <p>
                For requests, email us at{" "}
                <a
                  href="mailto:info@cicalino.net"
                  className="font-semibold text-marca hover:underline"
                >
                  info@cicalino.net
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

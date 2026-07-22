"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Controls } from "@/components/ui/Controls";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { useApp } from "@/components/providers/Providers";

const TerminosPage = () => {
  const { t, locale } = useApp();
  const es = locale !== "en";

  return (
    <div className="flex min-h-dvh flex-col bg-crema">
      <header className="sticky top-0 z-20 border-b border-linea/70 bg-crema/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3">
          <Logo className="h-10" />
          <Controls />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <Link href="/" className="text-xs font-semibold text-marca hover:underline">
          ← Cicalino
        </Link>
        <h1 className="mt-4 font-display text-4xl uppercase tracking-tight text-carbon">
          {t("nav.terminos")}
        </h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-carbon/70">
          {es ? (
            <>
              <p>
                Al usar Cicalino aceptás estos términos. El servicio es un
                avisador de pedidos por QR para negocios gastronómicos.
              </p>
              <p>
                El local es responsable de los datos que carga (empleados,
                pedidos, datos fiscales) y de cumplir la normativa aplicable en
                Argentina.
              </p>
              <p>
                Los planes y precios pueden actualizarse; te avisamos con
                anticipación razonable. La prueba gratis no garantiza
                disponibilidad indefinida de features en beta.
              </p>
            </>
          ) : (
            <>
              <p>
                By using Cicalino you accept these terms. The product is a QR
                order-notice tool for food businesses.
              </p>
              <p>
                The venue is responsible for the data it enters (staff, orders,
                tax details) and for complying with applicable law.
              </p>
              <p>
                Plans and pricing may change with reasonable notice. Free trials
                don’t guarantee indefinite availability of beta features.
              </p>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};
export default TerminosPage;

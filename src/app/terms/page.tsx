"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Controls } from "@/components/ui/Controls";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { useApp } from "@/components/providers/Providers";
import { TERMS_VERSION } from "@/lib/contract";

const TerminosPage = () => {
  const { t, locale } = useApp();
  const es = locale !== "en";

  return (
    <div className="flex min-h-dvh flex-col bg-crema">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo className="h-10 sm:h-12" />
        <Controls />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <Link href="/" className="text-xs font-semibold text-marca hover:underline">
          ← Cicalino
        </Link>
        <h1 className="mt-4 font-display text-4xl uppercase tracking-tight text-carbon">
          {t("nav.terminos")}
        </h1>
        <p className="mt-2 text-xs text-carbon/45">
          {es ? "Versión" : "Version"} {TERMS_VERSION}
        </p>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-carbon/70">
          {es ? (
            <>
              <p>
                Al usar Cicalino aceptás estos términos. El servicio es un
                avisador de pedidos por QR para negocios gastronómicos. El
                cliente final del local no paga ni se registra en Cicalino.
              </p>
              <p>
                <b className="text-carbon">Contratación.</b> El servicio se
                contrata por organización y sucursales (cupo). El alta puede
                incluir un período de prueba. Al contratar o continuar el
                servicio, el responsable aceptá estas bases (por ejemplo mediante
                el link de aceptación que enviamos por mail) y abona según el
                plan acordado (mensual o anual).
              </p>
              <p>
                <b className="text-carbon">Precio e inflación.</b> El precio
                publicado o acordado puede actualizarse, en particular por
                variación de costos e inflación en Argentina. Te avisamos con
                anticipación razonable (por mail o en el panel) antes de que el
                nuevo valor aplique al <b>próximo</b> ciclo de cobro. Si no
                querés continuar al nuevo precio, podés cancelar antes de ese
                ciclo; no hay reintegros proporcionales salvo pacto distinto.
              </p>
              <p>
                <b className="text-carbon">Pago.</b> Hoy el cobro es manual
                (transferencia / Mercado Pago al alias indicado). La falta de
                pago puede implicar pausa del servicio. El plan anual se abona
                por adelantado según la cotización vigente al momento del pago.
              </p>
              <p>
                <b className="text-carbon">Sucursales nuevas y cobro.</b>{" "}
                <b>Plan mensual:</b> si agregás una sucursal a mitad de mes, esa
                sucursal puede usarse ya, pero <b>no se cobra en el ciclo
                actual</b>. Su precio se suma recién en el <b>próximo</b> cobro
                mensual (no hay cobro proporcional por los días que faltan del
                mes en curso). <b>Plan anual:</b> cada sucursal nueva se cobra
                aparte, por un año completo, desde la fecha de alta de esa
                sucursal (no se prorratea con el aniversario de las demás).
              </p>
              <p>
                <b className="text-carbon">Arrepentimiento y reintegros.</b>{" "}
                Tenés <b>72 horas</b> desde el pago (mensual o anual) para
                arrepentirte: escribinos a info@cicalino.net y, si el servicio
                no tuvo uso relevante (casi sin pedidos operados), te devolvemos
                el importe. Pasado ese plazo no hay reintegro: el período
                abonado sigue vigente hasta su vencimiento aunque dejes de usar
                el servicio. Tampoco hay reintegros proporcionales por baja
                anticipada, salvo pacto distinto por escrito.
              </p>
              <p>
                <b className="text-carbon">Responsabilidades del local.</b> El
                local es responsable de los datos que carga (employees, pedidos,
                datos fiscales), del uso del panel y de cumplir la normativa
                aplicable en Argentina. Cicalino no sustituye sistemas de
                facturación ni de gestión gastronómica completa.
              </p>
              <p>
                <b className="text-carbon">Disponibilidad.</b> El servicio se
                presta “tal cual”, sujeto a disponibilidad de internet, del
                navegador del cliente y de proveedores (hosting, push, correo).
              </p>
              <p>
                Contacto:{" "}
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
                By using Cicalino you accept these terms. The product is a QR
                order-notice tool for food businesses. End customers never pay
                or create an account.
              </p>
              <p>
                <b className="text-carbon">Contracting.</b> The service is sold
                per organization and branch quota. Onboarding may include a
                trial. To start or continue, the business owner accepts these
                terms (e.g. via the acceptance link we email) and pays the agreed
                plan (monthly or yearly).
              </p>
              <p>
                <b className="text-carbon">Pricing.</b> Listed or agreed prices
                may change (including due to inflation). We give reasonable
                notice before a new price applies to the <b>next</b> billing
                cycle. You may cancel before that cycle if you do not accept the
                new price.
              </p>
              <p>
                <b className="text-carbon">Payment.</b> Billing is currently
                manual (transfer / Mercado Pago). Non-payment may pause the
                service. Yearly plans are paid in advance at the rate in force
                when paid.
              </p>
              <p>
                <b className="text-carbon">New branches and billing.</b>{" "}
                <b>Monthly plan:</b> if you add a branch mid-cycle, you can use
                it right away, but it is <b>not charged in the current
                cycle</b>. Its price is added only on the <b>next</b> monthly
                bill (no prorated charge for the remaining days of the current
                month). <b>Yearly plan:</b> each new branch is a separate
                full-year charge from that branch&apos;s start date (not
                prorated against the anniversary of other branches).
              </p>
              <p>
                <b className="text-carbon">Cooling-off and refunds.</b> You have{" "}
                <b>72 hours</b> from payment (monthly or yearly) to change your
                mind: email info@cicalino.net and, if there was no meaningful
                use (almost no live orders), we refund in full. After that there
                is no refund: the paid period remains available until it ends
                even if you stop using the service. There are also no
                proportional refunds for early cancellation, unless agreed
                otherwise in writing.
              </p>
              <p>
                <b className="text-carbon">Venue responsibilities.</b> The venue
                is responsible for the data it enters and for complying with
                applicable law. Cicalino is not a full POS or invoicing system.
              </p>
              <p>
                Contact:{" "}
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
export default TerminosPage;

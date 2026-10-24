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
                <b className="text-carbon">Nombre del cliente.</b> Para pedir
                desde el QR de una mesa se pide un nombre; en el mostrador es
                opcional. Sirve para que el local reconozca el pedido y queda
                con el pedido en el historial del local.
              </p>
              <p>
                <b className="text-carbon">Reconocer el mismo teléfono.</b> Al
                pedir desde un QR guardamos en el navegador una credencial al
                azar: una cookie que vence a las 12 horas y una copia en el
                almacenamiento del navegador, que se puede borrar desde la
                configuración del navegador. En nuestra base queda solo una
                huella (hash) de esa credencial, no la credencial. El nombre no
                da acceso a nada.
              </p>
              <p>
                <b className="text-carbon">Link del pedido.</b> Cada pedido
                tiene un link propio con un código largo y al azar. Quien tenga
                el link ve ese pedido (productos, total y estado) y ningún otro.
                Copiarlo, compartirlo o guardarlo lo decide el cliente.
              </p>
              <p>
                <b className="text-carbon">Notificaciones.</b> Son opcionales.
                Si el cliente las activa, guardamos la suscripción que genera su
                navegador, atada a su pedido, su espera o su identidad en la
                mesa, solo para mandarle ese aviso. Se borran solas a los tres
                días. El aviso pasa por el servicio de notificaciones del
                navegador (por ejemplo, de Google, Apple o Mozilla) y su entrega
                depende del dispositivo y del navegador.
              </p>
              <p>
                <b className="text-carbon">Proveedores.</b> Para prestar el
                servicio usamos proveedores que procesan datos por cuenta
                nuestra: base de datos y autenticación (Supabase), alojamiento y
                métricas de uso del sitio (Vercel), registro de errores
                (Sentry) y correo (Resend). Si el cliente paga con Mercado
                Pago, el pago lo procesa Mercado Pago: Cicalino guarda el
                resultado y el importe, no los datos de la tarjeta.
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
                <b className="text-carbon">Customer name.</b> Ordering from a
                table QR asks for a name; at the counter it&apos;s optional. It
                lets the venue recognize the order and stays with the order in
                the venue&apos;s history.
              </p>
              <p>
                <b className="text-carbon">Recognizing the same phone.</b> When
                ordering from a QR we store a random credential in the browser:
                a cookie that expires after 12 hours and a copy in the
                browser&apos;s storage, which can be cleared from the browser
                settings. Our database keeps only a fingerprint (hash) of that
                credential, not the credential itself. The name grants no
                access.
              </p>
              <p>
                <b className="text-carbon">Order link.</b> Each order has its own
                link with a long random code. Anyone with the link sees that
                order (items, total and status) and no other. Copying, sharing
                or saving it is up to the customer.
              </p>
              <p>
                <b className="text-carbon">Notifications.</b> They&apos;re
                optional. If the customer turns them on, we store the
                subscription their browser creates, tied to their order, their
                waitlist entry or their table identity, only to send that
                notice. They are deleted automatically after three days. The
                notice goes through the browser&apos;s notification service (for
                example Google, Apple or Mozilla) and delivery depends on the
                device and browser.
              </p>
              <p>
                <b className="text-carbon">Providers.</b> To run the service we
                use providers that process data on our behalf: database and
                authentication (Supabase), hosting and site usage metrics
                (Vercel), error logging (Sentry) and email (Resend). If the
                customer pays with Mercado Pago, Mercado Pago processes the
                payment: Cicalino stores the result and the amount, not the card
                details.
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

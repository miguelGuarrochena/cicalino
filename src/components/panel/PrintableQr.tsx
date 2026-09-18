"use client";

import { useApp } from "@/components/providers/Providers";

/* El QR en papel: el cartelito que queda pegado en la mesa o en el mostrador.
 *
 * Mismo camino que `PrintableBill`: el papel se arma dentro de la app, oculto
 * en pantalla y visible solo al imprimir. Antes esto abría una ventana nueva y
 * le escribía HTML a mano, con `system-ui` y `#111`: salía un sticker que no
 * se parecía a Cicalino, y si el navegador bloqueaba los emergentes el botón
 * no hacía nada.
 *
 * El papel no imita al modal a propósito. En pantalla el QR convive con
 * botones y explicaciones; pegado en una mesa tiene que leerse a un metro y de
 * reojo, así que va número grande arriba, QR grande al medio y una sola línea
 * de instrucción abajo.
 *
 * Todo en negro sobre blanco explícito, sin tokens de tema: con el panel en
 * oscuro, `text-carbon` imprime casi blanco y el sticker sale en blanco. */
export const PrintableQr = ({
  dataUrl,
  reference,
  etiqueta,
  venueName,
  hint,
}: {
  dataUrl: string;
  reference: string;
  etiqueta: string;
  venueName?: string;
  hint: string;
}) => {
  const { t } = useApp();
  const venue = venueName?.trim();

  return (
    <div
      data-imprimible="qr"
      aria-hidden
      className="hidden w-full bg-white px-8 py-10 text-center text-black print:block"
    >
      {venue ? (
        <p className="font-display text-2xl uppercase tracking-tight">{venue}</p>
      ) : null}
      <p className="mt-1 text-sm uppercase tracking-[0.2em]">{etiqueta}</p>
      <p className="font-display text-6xl leading-none">{reference}</p>
      {dataUrl ? (
        /* El data: URL lo genera la librería en el navegador con el token de
           esta mesa; no hay archivo que optimizar, así que no va next/image.
           68 mm es el mínimo que escanea cómodo desde el borde de una mesa. */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={dataUrl}
          alt=""
          className="mx-auto mt-6 h-[68mm] w-[68mm] max-w-full"
        />
      ) : null}
      <p className="mt-5 text-base">{hint}</p>
      <p className="mt-8 text-xs uppercase tracking-[0.3em]">
        {t("qr.impresoPor")}
      </p>
    </div>
  );
};

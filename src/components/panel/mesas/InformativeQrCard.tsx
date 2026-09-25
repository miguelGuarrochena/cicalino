"use client";

import { useApp } from "@/components/providers/Providers";
import {
  informativeQrCopy,
  secondGroupStart,
  type InformativeQrFlow,
} from "@/lib/qrInformativo";

/* Cartel horizontal de mesa: nombre del local, QR e instrucciones Pedí / Pagá.
 *
 * Las medidas van en unidades de contenedor (`cqh` / `cqw`) para que el mismo
 * markup sirva de preview en el modal y de papel a 180 × 102 mm. El PNG se
 * dibuja aparte en `qrSticker` con las mismas proporciones: si movés bloques
 * acá, movelos allá. El QR simple no pasa por este componente. */

const Step = ({
  n,
  text,
  accent,
}: {
  n: number;
  text: string;
  accent: string;
}) => (
  <div
    className="flex items-baseline"
    style={{ gap: "1.4cqw", marginTop: "1.15cqh" }}
  >
    <span
      className="shrink-0 font-semibold tabular-nums"
      style={{ color: accent, fontSize: "4.1cqh", width: "3.6cqh" }}
    >
      {n}
    </span>
    <span
      className="min-w-0 font-medium leading-snug text-black"
      style={{ fontSize: "4.1cqh" }}
    >
      {text}
    </span>
  </div>
);

const Group = ({
  label,
  steps,
  start,
  note,
  accent,
}: {
  label: string;
  steps: readonly string[];
  start: number;
  note: string;
  accent: string;
}) => (
  <div>
    <p
      className="font-semibold uppercase text-black"
      style={{
        color: accent,
        fontSize: "2.6cqh",
        letterSpacing: "0.16em",
      }}
    >
      {label}
    </p>
    {steps.map((text, i) => (
      <Step key={text} n={start + i} text={text} accent={accent} />
    ))}
    <p
      className="leading-snug text-black/50"
      style={{ fontSize: "2.7cqh", marginTop: "1.4cqh" }}
    >
      {note}
    </p>
  </div>
);

export const InformativeQrCard = ({
  qrSrc,
  venue,
  tableLabel,
  accent,
  flow = "cuenta",
}: {
  qrSrc: string;
  venue: string;
  tableLabel: string;
  accent: string;
  flow?: InformativeQrFlow;
}) => {
  const { t } = useApp();
  const copy = informativeQrCopy(t, flow);

  return (
    <div
      className="box-border flex h-full w-full flex-col overflow-hidden bg-white text-black"
      style={{
        containerType: "size",
        padding: "5cqh 4.2cqw",
        border: "1px solid #e8e8e8",
      }}
    >
      <header className="shrink-0">
        <p
          className="line-clamp-2 font-display leading-[1.05] tracking-tight text-black"
          style={{ fontSize: "6.2cqh" }}
        >
          {venue}
        </p>
        <p
          className="text-black/55"
          style={{ fontSize: "3.8cqh", marginTop: "0.8cqh" }}
        >
          {copy.title}
        </p>
      </header>

      <div
        className="flex min-h-0 flex-1"
        style={{ marginTop: "2.6cqh", gap: "3.6cqw" }}
      >
        <div
          className="flex shrink-0 flex-col items-center"
          style={{ width: "67cqh" }}
        >
          {qrSrc ? (
            /* El data: URL lo genera la librería en el navegador; no hay
               archivo que optimizar, así que no va next/image. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={qrSrc} alt="" className="w-full" />
          ) : null}
          <p
            className="font-medium text-black/45"
            style={{ fontSize: "2.5cqh", marginTop: "1.2cqh" }}
          >
            {tableLabel}
          </p>
        </div>

        <div className="w-px shrink-0 self-stretch bg-black/10" />

        <div className="flex min-w-0 flex-1 flex-col">
          <Group
            label={copy.orderLabel}
            steps={copy.orderSteps}
            start={1}
            note={copy.orderNote}
            accent={accent}
          />
          <div
            className="bg-black/10"
            style={{ height: "1px", margin: "2.2cqh 0" }}
          />
          <Group
            label={copy.payLabel}
            steps={copy.paySteps}
            start={secondGroupStart(copy)}
            note={copy.payNote}
            accent={accent}
          />
          <p
            className="mt-auto text-right text-black/35"
            style={{ fontSize: "2.2cqh", paddingTop: "1.6cqh" }}
          >
            {copy.byline}
          </p>
        </div>
      </div>
    </div>
  );
};

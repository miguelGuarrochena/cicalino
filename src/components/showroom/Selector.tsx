"use client";

/* La portada. Cicalino se presenta, ofrece la presentación completa y abajo
 * están los cuatro temas, uno por rincón del local (el mostrador, el QR, la
 * puerta, la mesa) —que es como lo piensa el dueño—, cada uno en su bloque
 * con el ícono y el color que tiene en el panel. */

import type { ReactNode } from "react";
import { NavIconSvg } from "@/components/panel/NavIcons";
import { TabGlyph } from "@/components/ui/TabGlyph";
import { Bag, CardG, ClockG, DoorG, MascotImg, PhoneG, PingG, QrStand, STROKE, Ticket } from "./art";
import { Bubble, d } from "./scenes";
import type { TourId } from "./tours";

type Station = {
  id: Exclude<TourId, "completa">;
  name: string;
  hook: string;
  /* Clases del módulo: borde al pasar, círculo del ícono y texto. */
  tone: { hover: string; chip: string; text: string };
  icon: ReactNode;
  art: ReactNode;
};

/* Los mismos tonos que los botones de módulo del panel (ModuleHub). */
const MARCA = { hover: "hover:border-marca/45", chip: "border-marca/30 bg-marca/10 text-marca", text: "text-marca" };
const ESPERA = { hover: "hover:border-espera/45", chip: "border-espera/30 bg-espera/10 text-espera", text: "text-espera" };
const PAGOS = { hover: "hover:border-pagos/45", chip: "border-pagos/30 bg-pagos/10 text-pagos", text: "text-pagos" };

const STATIONS: Station[] = [
  {
    id: "pedidos",
    name: "Pedidos",
    hook: "La caja lo carga, vos avisás",
    tone: MARCA,
    icon: <NavIconSvg k="orders" size={24} />,
    art: (
      <>
        <Bag x={30} y={30} label="42" />
        <PhoneG x={104} y={20}>
          <rect x="7" y="20" width="30" height="14" rx="5" fill="var(--brand)" />
        </PhoneG>
        <PingG x={156} y={26} s={0.8} />
      </>
    ),
  },
  {
    id: "celular",
    name: "Pedidos desde el celular",
    hook: "Piden de la carta, en el mostrador o la mesa",
    tone: MARCA,
    icon: <TabGlyph k="qr" size={24} />,
    art: (
      <>
        <QrStand x={28} y={24} />
        <PhoneG x={112} y={20}>
          <path d="M10 26 H34 M10 36 H30 M10 46 H32" {...STROKE} strokeWidth={3.5} />
        </PhoneG>
      </>
    ),
  },
  {
    id: "recepcion",
    name: "Recepción",
    hook: "Lista de espera y reservas",
    tone: ESPERA,
    icon: <NavIconSvg k="espera" size={24} />,
    art: (
      <>
        <g transform="translate(30 4) scale(0.62)">
          <DoorG />
        </g>
        <ClockG x={130} y={56} r={24} hand="var(--espera)" />
      </>
    ),
  },
  {
    id: "pagos",
    name: "Pagos divididos",
    hook: "Piden de la carta y cada uno paga lo suyo",
    tone: PAGOS,
    icon: <NavIconSvg k="mesas" size={24} />,
    art: (
      <>
        <Ticket x={30} y={14} s={1.25} />
        <CardG x={98} y={50} fill="var(--surface)" />
      </>
    ),
  },
];

export const Selector = ({ onStart }: { onStart: (id: TourId) => void }) => (
  <div className="show-scene-next mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center-safe gap-[clamp(1.5rem,5vh,3.25rem)] px-5 py-2 sm:px-10">
    <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:justify-center sm:gap-[4.5rem] sm:text-left">
      <div className="show-pop relative shrink-0" style={d(0.05)}>
        <span className="absolute inset-[10%] rounded-full bg-marca/8" aria-hidden />
        <div className="show-ring" style={d(0.9)}>
          <MascotImg pose="bell" alt="Cicalino saludando" className="relative w-[clamp(7rem,15vw,12rem)]" />
        </div>
        <Bubble tail="left" className="-right-6 -top-4 sm:-right-14" style={d(0.6)}>
          ¡Hola!
        </Bubble>
      </div>
      <div className="flex flex-col items-center gap-5 sm:items-start">
        <h1 className="show-h1 show-in max-w-[14ch]" style={d(0.15)}>
          Te muestro cómo funciona.
        </h1>
        <div className="show-in flex flex-col items-center gap-2 sm:flex-row sm:gap-4" style={d(0.35)}>
          <button
            type="button"
            onClick={() => onStart("completa")}
            className="flex min-h-14 items-center justify-center gap-3 rounded-full bg-marca pl-3 pr-8 text-lg font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
            autoFocus
          >
            <span className="grid size-9 place-items-center rounded-full bg-crema/15" aria-hidden>
              <svg viewBox="0 0 20 20" className="ml-0.5 size-4">
                <path d="M5 3 L16 10 L5 17 Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </span>
            Conocé Cicalino
          </button>
          <span className="text-sm font-semibold text-suave">3 minutos</span>
        </div>
      </div>
    </div>

    <div className="flex flex-col gap-4">
      <p className="show-in text-center font-semibold text-marca/80 sm:text-lg" style={d(0.6)}>
        O vamos directo a una parte del local:
      </p>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {STATIONS.map((s, i) => (
          <li key={s.id} className="show-in" style={d(0.75 + i * 0.12)}>
            <button
              type="button"
              onClick={() => onStart(s.id)}
              className={`show-station group flex h-full w-full flex-col items-start rounded-[28px] border-2 border-linea bg-surface p-4 text-left sm:p-5 ${s.tone.hover}`}
              aria-label={`${s.name}: ${s.hook}`}
            >
              <div className="flex w-full items-start justify-between">
                <span className={`grid size-12 place-items-center rounded-full border-2 ${s.tone.chip}`} aria-hidden>
                  {s.icon}
                </span>
                <span
                  className={`grid size-9 place-items-center rounded-full transition group-hover:translate-x-0.5 ${s.tone.text}`}
                  aria-hidden
                >
                  <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10 H15 M10 5 L15 10 L10 15" />
                  </svg>
                </span>
              </div>
              <svg viewBox="0 0 180 112" className={`my-2 h-[clamp(4.5rem,13vh,7rem)] w-full ${s.tone.text}`} aria-hidden>
                {s.art}
              </svg>
              <span className={`font-display text-[clamp(0.95rem,1.45vw,1.25rem)] uppercase leading-tight tracking-tight ${s.tone.text}`}>
                {s.name}
              </span>
              <span className="mt-1 text-[clamp(0.85rem,1.1vw,0.98rem)] font-medium text-suave">{s.hook}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

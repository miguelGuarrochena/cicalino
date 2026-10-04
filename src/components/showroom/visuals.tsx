"use client";

/* Las escenas dibujadas a medida: el local con sus problemas, el antes y
 * después, el ida y vuelta entre el cliente y el panel, y todo conectado.
 * Usan las piezas de art.tsx y las plantillas de scenes.tsx. */

import type { CSSProperties, ReactNode } from "react";
import bellLight from "../../../public/bell-light.png";
import {
  Bag,
  Buzzer,
  CardG,
  ClockG,
  CounterG,
  Cup,
  DoorG,
  MascotImg,
  MenuG,
  Notification,
  Phone,
  PhoneG,
  PingG,
  Qr,
  QrBox,
  QrStand,
  Row,
  STROKE,
  TableG,
  Tablet,
  Ticket,
  TurnChips,
} from "./art";
import { Connector, d, SceneFrame, SceneTitle, type Tone } from "./scenes";

const PAPER = "var(--surface)";

/* ---------------------------------------------------------------------------
 * Las situaciones de todos los días (para los problemas)
 *
 * Objetos, no personas: el pedido y el reloj, la puerta, la cuenta. Que el
 * dueño reconozca el momento sin que la escena exagere. */

const Q = ({ x, y, size = 30 }: { x: number; y: number; size?: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <circle r={size / 2} fill="currentColor" />
    <text y={size * 0.2} textAnchor="middle" fontFamily="var(--font-display)" fontSize={size * 0.62} fill="var(--surface)">
      ?
    </text>
  </g>
);

export const SITUACION = {
  pedidoListo: (
    <>
      <Bag x={28} y={34} label="42" />
      <ClockG x={118} y={56} r={24} hand="var(--brand)" />
    </>
  ),
  vozAlta: (
    <>
      <rect x="20" y="22" width="84" height="54" rx="22" {...STROKE} fill={PAPER} />
      <path d="M40 74 L34 94 L58 76" {...STROKE} fill={PAPER} />
      <text x="62" y="58" textAnchor="middle" fontFamily="var(--font-display)" fontSize="28" fill="currentColor">
        42
      </text>
      <path d="M118 36 q10 13 0 26 M130 28 q16 21 0 42" {...STROKE} strokeWidth={4.5} opacity={0.5} />
    </>
  ),
  buzzer: (
    <>
      <Buzzer x={30} y={36} />
      <path d="M92 64 H138" {...STROKE} strokeDasharray="2 12" />
      <path d="M130 54 L142 64 L130 74" {...STROKE} />
    </>
  ),
  fila: (
    <>
      <TurnChips x={14} y={28} nums={["41", "42", "43"]} />
      <ClockG x={120} y={96} r={16} hand="var(--brand)" />
    </>
  ),
  dictar: (
    <>
      <MenuG x={22} y={20} />
      <rect x="92" y="30" width="54" height="36" rx="16" {...STROKE} fill={PAPER} />
      <path d="M104 64 L100 78 L116 66" {...STROKE} fill={PAPER} />
      <path d="M106 48 h26" {...STROKE} strokeWidth={4} />
    </>
  ),
  mesaEspera: (
    <>
      <MenuG x={38} y={26} s={0.75} />
      <TableG x={10} y={86} w={140} />
      <ClockG x={120} y={50} r={20} hand="var(--brand)" />
    </>
  ),
  puerta: (
    <>
      <DoorG x={22} y={10} transform="translate(22 10) scale(0.66)" />
      <ClockG x={118} y={58} r={24} hand="var(--espera)" />
    </>
  ),
  lista: (
    <>
      <Ticket x={30} y={14} s={1.3} />
      <Q x={118} y={50} />
    </>
  ),
  mesaLibre: (
    <>
      <TableG x={10} y={80} w={140} />
      <path d="M50 70 h60" {...STROKE} strokeDasharray="2 10" opacity={0.6} />
      <Q x={80} y={36} />
    </>
  ),
  cuenta: (
    <>
      <Ticket x={30} y={20} s={1.25} />
      <ClockG x={118} y={58} r={24} hand="var(--pagos)" />
    </>
  ),
  /* Uno solo paga toda la cuenta, con un solo medio. */
  unoPaga: (
    <>
      <Ticket x={18} y={18} s={1.25} />
      <path d="M82 56 H96" {...STROKE} strokeWidth={4.5} />
      <CardG x={100} y={38} s={0.75} fill="var(--surface)" />
    </>
  ),
  /* Después, entre ellos: "¿cuánto te debo?". */
  cuantoTeDebo: (
    <>
      <PhoneG x={16} y={24} s={0.85} />
      <PhoneG x={110} y={24} s={0.85} />
      <path d="M60 50 Q80 30 100 50" {...STROKE} strokeWidth={4.5} />
      <path d="M93 40 L101 51 L88 52" {...STROKE} strokeWidth={4.5} />
      <Q x={80} y={86} size={26} />
    </>
  ),
};

export const SituationArt = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 160 120" className="h-full" aria-hidden>
    {children}
  </svg>
);

/* ---------------------------------------------------------------------------
 * El cambio: el camino de hoy y el de Cicalino */

export const ChangeScene = () => {
  const tangled =
    "M150 112 C 210 20, 250 200, 300 110 S 380 6, 420 118 S 520 210, 545 96 S 640 24, 665 140 S 720 118, 748 112";
  const straight = "M150 290 H748";
  const stops: { x: number; y: number; t: string }[] = [
    { x: 300, y: 110, t: "espera" },
    { x: 420, y: 118, t: "pregunta" },
    { x: 545, y: 96, t: "mozo" },
    { x: 665, y: 140, t: "caja" },
  ];
  return (
    <SceneFrame>
      <SceneTitle title="¿Y si el aviso llegara solo?" />
      <svg viewBox="0 0 900 360" className="show-in w-full max-w-5xl text-marca" style={d(0.3)} aria-hidden>
        {/* Hoy */}
        <g className="show-dim" style={d(3.1)}>
          <text x="20" y="34" fontFamily="var(--font-display)" fontSize="22" fill="currentColor">
            HOY
          </text>
          <PhoneG x={56} y={72} />
          <text x="78" y="182" textAnchor="middle" fontSize="18" fontWeight="700" fill="currentColor">
            cliente
          </text>
          <path d={tangled} pathLength={1} className="show-draw" style={{ ...d(0.5), "--t": "2s" } as CSSProperties} {...STROKE} />
          {stops.map((s, i) => (
            <g key={s.t} className="show-pop" style={d(0.8 + i * 0.4)}>
              <circle cx={s.x} cy={s.y} r="9" fill={PAPER} stroke="currentColor" strokeWidth="4.5" />
              <text x={s.x} y={s.y + 36} textAnchor="middle" fontSize="19" fontWeight="700" fill="currentColor" stroke="var(--bg)" strokeWidth="7" paintOrder="stroke">
                {s.t}
              </text>
            </g>
          ))}
          <CounterG x={770} y={112} w={110} h={52} />
        </g>

        {/* Con Cicalino */}
        <g className="show-in" style={d(3.3)}>
          <text x="20" y="214" fontFamily="var(--font-display)" fontSize="22" fill="currentColor">
            CON CICALINO
          </text>
          <PhoneG x={56} y={250} />
          <PingG x={108} y={256} />
          <path d={straight} pathLength={1} className="show-draw" style={{ ...d(3.6), "--t": "0.9s" } as CSSProperties} {...STROKE} strokeWidth={7} />
          <g className="show-pop" style={d(4.1)}>
            <rect x="420" y="258" width="64" height="64" rx="12" fill={PAPER} stroke="currentColor" strokeWidth="5" />
            <Qr x={432} y={270} size={40} />
          </g>
          <CounterG x={770} y={290} w={110} h={52} />
          <text x="825" y="276" textAnchor="middle" fontSize="19" fontWeight="700" fill="currentColor">
            tu local
          </text>
          <image href={bellLight.src} width="54" height="54" x="-27" y="-60" opacity="0">
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="2.4s" begin="4.6s" repeatCount="indefinite" />
            <animateMotion path="M150 290 H748" dur="2.4s" begin="4.6s" repeatCount="indefinite" />
          </image>
        </g>
      </svg>
    </SceneFrame>
  );
};

/* ---------------------------------------------------------------------------
 * Lo que ve el cliente en el celular */

export const PhoneScan = () => (
  <Phone className="h-full">
    <p className="text-center text-[0.6rem] font-bold uppercase tracking-wide text-marca/70">Cámara</p>
    <div className="relative mx-auto mt-2 grid flex-1 place-items-center">
      <span className="absolute inset-[8%] rounded-xl border-[3px] border-dashed border-marca/40" aria-hidden />
      <QrBox size={64} />
    </div>
  </Phone>
);

export const PhoneChoose = () => (
  <Phone className="h-full">
    <p className="text-center text-[0.68rem] font-bold text-marca">Mesa 4</p>
    <div className="mt-2 flex flex-1 flex-col justify-center gap-1.5">
      {["Pedir", "Esperar", "Pagar"].map((l, i) => (
        <span
          key={l}
          className="show-pop rounded-full border-[2.5px] border-marca py-1 text-center text-[0.72rem] font-bold text-marca"
          style={d(2.6 + i * 0.2)}
        >
          {l}
        </span>
      ))}
    </div>
  </Phone>
);

export const PhoneAlert = ({ title, big, delay = 0 }: { title: string; big: string; delay?: number }) => (
  <Phone className="h-full">
    <Notification title={title} compact className="show-drop" style={d(delay)} />
    <div className="flex flex-1 flex-col items-center justify-center">
      <span className="font-display text-[clamp(1.8rem,3.5vw,2.8rem)] leading-none text-marca">{big}</span>
      <span className="mt-1 text-[0.65rem] font-bold uppercase tracking-wide text-ok">Listo</span>
    </div>
  </Phone>
);

export const TableWithQr = () => (
  <svg viewBox="0 0 200 170" className="h-full text-marca" aria-hidden>
    <QrStand x={64} y={58} />
    <TableG x={10} y={132} w={180} />
  </svg>
);

/* ---------------------------------------------------------------------------
 * El ida y vuelta: el cliente hace algo, el panel lo ve, el panel avisa */

export const LocalSideScene = () => (
  <SceneFrame>
    <SceneTitle title="Y tu local lo ve al toque." lead="Un toque, y el cliente se entera." />
    <div className="flex w-full flex-col items-center justify-center gap-4 sm:flex-row sm:gap-2">
      <div className="show-in h-[clamp(14rem,44vh,22rem)]" style={d(0.4)}>
        <Phone className="h-full">
          <p className="text-center text-[0.68rem] font-bold text-marca">Mesa 4</p>
          <div className="mt-2 flex flex-col gap-1.5 text-[0.7rem] font-semibold text-carbon">
            <span className="flex justify-between border-b-2 border-linea pb-1">
              <span>2 cafés</span>
              <span className="text-suave">✓</span>
            </span>
            <span className="flex justify-between border-b-2 border-linea pb-1">
              <span>Medialunas</span>
              <span className="text-suave">✓</span>
            </span>
          </div>
          <span className="mt-auto rounded-full bg-marca py-1.5 text-center text-[0.72rem] font-bold text-crema">
            Enviar pedido
          </span>
          <div className="absolute inset-x-2 top-2">
            <Notification compact title="Pedido 42 listo para retirar" className="show-drop" style={d(4.4)} />
          </div>
        </Phone>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Connector delay={0.9} />
        <Connector delay={3.7} className="rotate-180 max-sm:-rotate-90" />
      </div>

      <div className="show-in w-[min(32rem,92vw)]" style={d(0.6)}>
        <Tablet
          className="min-h-[clamp(12rem,38vh,20rem)]"
          tabs={[{ label: "Pedidos", active: true }, { label: "Recepción" }, { label: "Pagos" }]}
        >
          <Row className="show-in" style={d(1.4)}>
            <span className="size-2.5 shrink-0 rounded-full bg-marca" aria-hidden />
            Mesa 4 hizo un pedido
          </Row>
          <Row tone="pagos" className="show-in" style={d(1.9)}>
            <span className="size-2.5 shrink-0 rounded-full bg-pagos" aria-hidden />
            Mesa 12 pidió la cuenta
          </Row>
          <Row tone="espera" className="show-in" style={d(2.4)}>
            <span className="size-2.5 shrink-0 rounded-full bg-espera" aria-hidden />
            García entró a la lista
          </Row>
          <div className="show-in mt-1 flex items-center justify-between gap-2 rounded-2xl border-[2.5px] border-curso/30 bg-curso-fondo px-3 py-2" style={d(2.9)}>
            <span className="font-display text-[clamp(1.2rem,2.2vw,1.8rem)] leading-none text-curso">42</span>
            <span
              className="show-beat rounded-full bg-marca px-3 py-1.5 text-[clamp(0.72rem,1.1vw,0.95rem)] font-bold text-crema"
              style={d(3.3)}
            >
              Marcar listo · avisar
            </span>
          </div>
        </Tablet>
      </div>
    </div>
  </SceneFrame>
);

/* ---------------------------------------------------------------------------
 * Los tres momentos (los tres módulos) */

const MomentArt = ({ id }: { id: "pedidos" | "espera" | "pagos" }) => (
  <svg viewBox="0 0 200 140" className="h-full" aria-hidden>
    {id === "pedidos" && (
      <>
        <Bag x={30} y={50} label="42" />
        <rect x="112" y="18" width="62" height="112" rx="14" {...STROKE} fill={PAPER} />
        <path d="M122 46 H164" {...STROKE} strokeWidth={4} />
        <path d="M130 30 H156" {...STROKE} strokeWidth={4} />
      </>
    )}
    {id === "espera" && (
      <>
        <DoorG x={20} y={-12} />
        <PhoneG x={126} y={46} />
        <PingG x={176} y={52} s={0.8} />
      </>
    )}
    {id === "pagos" && (
      <>
        <Ticket x={24} y={30} s={1.3} />
        <Ticket x={110} y={40} s={1.3} />
        <path d="M94 20 V130" {...STROKE} strokeDasharray="2 12" />
      </>
    )}
    <path d="M8 134 H192" {...STROKE} strokeWidth={5} />
  </svg>
);

export const MomentsScene = () => {
  const items: { id: "pedidos" | "espera" | "pagos"; tone: Tone; name: string; when: string; client: string; local: string }[] = [
    { id: "pedidos", tone: "marca", name: "Pedidos", when: "Cuando el pedido está listo", local: "Tocás «Listo»", client: "Le llega el aviso" },
    { id: "espera", tone: "espera", name: "Recepción", when: "Cuando hay mesa", local: "Anotás al grupo", client: "Le avisás que pase" },
    { id: "pagos", tone: "pagos", name: "Pagos", when: "Cuando piden la cuenta", local: "Ves cuánto falta", client: "Cada uno paga lo suyo" },
  ];
  const tones = { marca: "text-marca", espera: "text-espera", pagos: "text-pagos" } as const;
  const dots = { marca: "bg-marca", espera: "bg-espera", pagos: "bg-pagos" } as const;
  return (
    <SceneFrame>
      <SceneTitle title="Tres momentos. Un solo Cicalino." />
      <ul className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-[clamp(0.75rem,2vw,1.5rem)]">
        {items.map((it, i) => (
          <li
            key={it.id}
            className="show-in flex flex-col items-center rounded-[28px] border-2 border-linea bg-surface p-4 text-center sm:p-[clamp(1rem,2vw,1.75rem)]"
            style={d(0.5 + i * 0.8)}
          >
            <span className={`flex items-center gap-2 text-[clamp(0.75rem,1vw,0.9rem)] font-semibold uppercase tracking-[0.25em] ${tones[it.tone]}`}>
              <span className={`size-2 rounded-full ${dots[it.tone]}`} aria-hidden />
              {it.name}
            </span>
            <div className={`my-3 h-[clamp(5.5rem,17vh,9rem)] ${tones[it.tone]}`}>
              <MomentArt id={it.id} />
            </div>
            <p className="show-h2 max-w-[14ch] text-carbon">{it.when}</p>
            <p className="mt-3 text-[clamp(0.9rem,1.35vw,1.15rem)] font-semibold text-suave">
              {it.local} <span className={tones[it.tone]}>→</span> {it.client}
            </p>
          </li>
        ))}
      </ul>
      <p className="show-in show-lead text-center" style={d(3.1)}>
        Y con la carta en el celular, el cliente también puede pedir solo.
      </p>
    </SceneFrame>
  );
};

/* ---------------------------------------------------------------------------
 * Todo conectado */

export const ConnectedScene = () => {
  const sources = [
    { y: 70, label: "Mostrador", color: "var(--brand)" },
    { y: 190, label: "Espera", color: "var(--espera)" },
    { y: 310, label: "Mesa", color: "var(--pagos)" },
  ];
  const tabs = [
    { y: 140, label: "Pedidos", color: "var(--brand)" },
    { y: 190, label: "Recepción", color: "var(--espera)" },
    { y: 240, label: "Pagos", color: "var(--pagos)" },
  ];
  return (
    <SceneFrame>
      <SceneTitle title="Todo en un solo lugar." lead="Arrancás con lo que necesitás y sumás el resto cuando quieras." />
      <svg viewBox="0 0 900 380" className="show-in w-full max-w-5xl text-marca" style={d(0.3)} aria-hidden>
        <text x="80" y="22" textAnchor="middle" fontSize="16" fontWeight="700" letterSpacing="3" fill="currentColor">
          TUS CLIENTES
        </text>
        <text x="760" y="22" textAnchor="middle" fontSize="16" fontWeight="700" letterSpacing="3" fill="currentColor">
          TU LOCAL
        </text>

        {sources.map((s, i) => {
          const path = `M118 ${s.y} C 240 ${s.y}, 270 190, 372 190`;
          return (
            <g key={s.label}>
              <path d={path} pathLength={1} className="show-draw" style={{ ...d(0.9 + i * 0.35), "--t": "0.9s" } as CSSProperties} {...STROKE} stroke={s.color} strokeWidth={6} />
              <g className="show-pop" style={d(0.4 + i * 0.3)}>
                <rect x="46" y={s.y - 34} width="68" height="68" rx="14" fill={PAPER} stroke="currentColor" strokeWidth="5" />
                <Qr x={60} y={s.y - 20} size={40} />
                <text x="80" y={s.y + 58} textAnchor="middle" fontSize="18" fontWeight="700" fill="currentColor">
                  {s.label}
                </text>
              </g>
              <circle r="7" fill={s.color} opacity="0">
                <animate attributeName="opacity" values="0;1;1;0" dur="2s" begin={`${2.4 + i * 0.5}s`} repeatCount="indefinite" />
                <animateMotion path={path} dur="2s" begin={`${2.4 + i * 0.5}s`} repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}

        <g className="show-pop" style={d(1.9)}>
          <circle cx="450" cy="190" r="82" fill={PAPER} stroke="currentColor" strokeWidth="6" />
          <image href={bellLight.src} x="392" y="134" width="116" height="112" />
        </g>

        <path d="M532 190 H612" pathLength={1} className="show-draw" style={{ ...d(2.3), "--t": "0.5s" } as CSSProperties} {...STROKE} strokeWidth={6} />
        <g className="show-pop" style={d(2.6)}>
          <rect x="620" y="96" width="250" height="190" rx="22" fill={PAPER} stroke="currentColor" strokeWidth="6" />
          {tabs.map((t) => (
            <g key={t.label}>
              <rect x="644" y={t.y - 19} width="202" height="38" rx="19" fill="none" stroke={t.color} strokeWidth="4" />
              <circle cx="666" cy={t.y} r="6" fill={t.color} />
              <text x="684" y={t.y + 7} fontSize="20" fontWeight="700" fill={t.color}>
                {t.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </SceneFrame>
  );
};

/* ---------------------------------------------------------------------------
 * Dibujos chicos para los beneficios */

export const Mini = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 140 110" className="h-full text-marca" aria-hidden>
    {children}
  </svg>
);

const Strike = () => <path d="M18 98 L122 12" {...STROKE} strokeWidth={7} stroke="var(--pagos)" />;

export const BenefitArt = {
  ping: (
    <Mini>
      <PhoneG x={44} y={16}>
        <rect x="7" y="20" width="30" height="14" rx="5" fill="var(--brand)" />
        <text x="22" y="62" textAnchor="middle" fontFamily="var(--font-display)" fontSize="18" fill="currentColor">
          42
        </text>
      </PhoneG>
      <PingG x={96} y={24} />
    </Mini>
  ),
  noBuzzer: (
    <Mini>
      <Buzzer x={44} y={32} />
      <Strike />
    </Mini>
  ),
  splitBill: (
    <Mini>
      <Ticket x={16} y={22} s={1.15} />
      <Ticket x={74} y={30} s={1.15} />
    </Mini>
  ),
  bell: <MascotImg pose="bell" className="h-full w-auto" />,
  qr: (
    <Mini>
      <rect x="34" y="10" width="72" height="72" rx="14" {...STROKE} fill={PAPER} />
      <Qr x={50} y={26} size={40} />
      <path d="M20 100 H120" {...STROKE} />
    </Mini>
  ),
  queue: (
    <Mini>
      <PhoneG x={22} y={18} />
      <PhoneG x={80} y={18} />
      <path d="M32 62 l8 8 l14 -16 M90 62 l8 8 l14 -16" {...STROKE} strokeWidth={4.5} />
    </Mini>
  ),
  tables: (
    <Mini>
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={14 + (i % 2) * 62}
          y={10 + Math.floor(i / 2) * 48}
          width="50"
          height="38"
          rx="10"
          {...STROKE}
          fill={i === 1 ? "var(--espera)" : PAPER}
          stroke={i === 1 ? "var(--espera)" : "currentColor"}
        />
      ))}
    </Mini>
  ),
  calendar: (
    <Mini>
      <rect x="22" y="18" width="96" height="84" rx="14" {...STROKE} fill={PAPER} />
      <path d="M22 42 H118 M46 8 V26 M94 8 V26" {...STROKE} />
      <circle cx="70" cy="72" r="12" fill="var(--espera)" />
    </Mini>
  ),
  check: (
    <Mini>
      <circle cx="70" cy="55" r="42" {...STROKE} fill={PAPER} />
      <path d="M50 56 L64 70 L92 40" {...STROKE} strokeWidth={8} />
    </Mini>
  ),
  clock: (
    <Mini>
      <circle cx="70" cy="55" r="42" {...STROKE} fill={PAPER} />
      <path d="M70 30 V55 L88 66" {...STROKE} />
    </Mini>
  ),
  cup: (
    <Mini>
      <Cup x={42} y={34} s={1.3} />
    </Mini>
  ),
  coins: (
    <Mini>
      <rect x="18" y="26" width="104" height="62" rx="14" {...STROKE} fill={PAPER} />
      <circle cx="70" cy="57" r="16" {...STROKE} />
      <path d="M70 48 V66" {...STROKE} strokeWidth={4} />
    </Mini>
  ),
};

/* ---------------------------------------------------------------------------
 * El panel en miniatura, para los pasos del lado del local */

export const MiniPanel = ({ children, tab = "Pedidos" }: { children: ReactNode; tab?: string }) => (
  <Tablet className="h-full w-[clamp(9rem,17vw,14rem)]" tabs={[{ label: tab, active: true }]}>
    <div className="flex flex-1 flex-col justify-center gap-2">{children}</div>
  </Tablet>
);

export const OrderCard = ({
  n,
  state,
  action,
  delay = 0,
}: {
  n: string;
  state: "curso" | "ok" | "retirado";
  action?: string;
  delay?: number;
}) => (
  <div
    className={`flex flex-col items-center gap-1 rounded-2xl border-[2.5px] px-2 py-2 ${
      state === "curso"
        ? "border-curso/30 bg-curso-fondo text-curso"
        : state === "ok"
          ? "border-ok/40 bg-ok-fondo text-ok"
          : "border-linea bg-crema/60 text-suave"
    }`}
  >
    <span className="font-display text-[clamp(1.2rem,2vw,1.7rem)] leading-none">{n}</span>
    <span className="text-[0.62rem] font-bold uppercase tracking-wide">
      {state === "curso" ? "En curso" : state === "ok" ? "Listo" : "Retirado"}
    </span>
    {action && (
      <span className="show-beat mt-1 rounded-full bg-marca px-2.5 py-1 text-[0.66rem] font-bold text-crema" style={d(delay)}>
        {action}
      </span>
    )}
  </div>
);

/* Los dibujos de la presentación.
 *
 * Mismo trazo que la mascota: cobalto, grueso, puntas redondas, relleno del
 * color del papel. Todo es SVG en línea o imagen estática del repo, así que
 * la presentación no pide nada a la red (ver docs/como-funciona.md).
 *
 * Las piezas chicas (`PhoneG`, `Qr`, `Cup`…) son grupos <g> para armar
 * escenas dentro de un mismo <svg>; las grandes (`Phone`, `Tablet`) son HTML
 * porque adentro llevan texto que tiene que leerse nítido. */

import type { CSSProperties, ReactNode, SVGProps } from "react";
import bellLight from "../../../public/bell-light.png";
import chefLight from "../../../public/chef-light.png";
import okLight from "../../../public/ok-light.png";
import esperaLight from "../../../public/espera-light.png";
import logoLight from "../../../public/logo-light.png";

/* ---------------------------------------------------------------------------
 * Mascota y logo
 *
 * <img> común con el PNG del build, sin pasar por el optimizador de
 * next/image: `/_next/image` necesita el servidor, y la copia offline no lo
 * tiene. Son los mismos archivos que usa el sitio. */

const MASCOTAS = {
  bell: bellLight,
  chef: chefLight,
  ok: okLight,
  phone: esperaLight,
} as const;

export type MascotPose = keyof typeof MASCOTAS;

/* Todas las imágenes de la presentación, aunque la escena que las usa todavía
 * no se haya mostrado: es lo que se guarda para usarla sin conexión. */
export const ALL_IMAGES = [...Object.values(MASCOTAS), logoLight].map((i) => i.src);

export const MascotImg = ({
  pose,
  className = "",
  style,
  alt = "",
}: {
  pose: MascotPose;
  className?: string;
  style?: CSSProperties;
  alt?: string;
}) => (
  // eslint-disable-next-line @next/next/no-img-element -- ver arriba: sin optimizador para que funcione offline.
  <img
    src={MASCOTAS[pose].src}
    width={MASCOTAS[pose].width}
    height={MASCOTAS[pose].height}
    alt={alt}
    draggable={false}
    className={`h-auto select-none ${className}`}
    style={style}
  />
);

export const LogoImg = ({ className = "" }: { className?: string }) => (
  // eslint-disable-next-line @next/next/no-img-element -- ver MascotImg.
  <img
    src={logoLight.src}
    width={logoLight.width}
    height={logoLight.height}
    alt="Cicalino"
    draggable={false}
    className={`w-auto select-none ${className}`}
  />
);

/* ---------------------------------------------------------------------------
 * Trazo base */

export const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const PAPER = "var(--surface)";

type G = SVGProps<SVGGElement>;

/* Sin personas: la presentación cuenta todo con objetos (el celular, el
 * reloj, la cuenta) y con la mascota, que es el único personaje. */

/* Un celular visto de frente. Adentro puede ir un dibujito (`children`, en
 * coordenadas del celular: 44 de ancho por 80 de alto). */
export const PhoneG = ({
  x = 0,
  y = 0,
  s = 1,
  children,
  ...rest
}: G & { x?: number; y?: number; s?: number; children?: ReactNode }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} {...rest}>
    <rect x="0" y="0" width="44" height="80" rx="10" {...STROKE} fill={PAPER} />
    <path d="M17 8 H27" {...STROKE} strokeWidth={4} />
    {children}
  </g>
);

/* El aviso que llega: un punto con ondas, como la campana del logo. */
export const PingG = ({ x = 0, y = 0, s = 1, color = "currentColor", ...rest }: G & { x?: number; y?: number; s?: number; color?: string }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} {...STROKE} stroke={color} {...rest}>
    <path d="M0 -14 l-3 -9" strokeWidth={4} />
    <path d="M10 -10 l6 -8" strokeWidth={4} />
    <path d="M14 0 l9 -2" strokeWidth={4} />
  </g>
);

export const ClockG = ({ x = 0, y = 0, r = 22, hand = "currentColor", ...rest }: G & { x?: number; y?: number; r?: number; hand?: string }) => (
  <g transform={`translate(${x} ${y})`} {...rest}>
    <circle cx="0" cy="0" r={r} {...STROKE} fill={PAPER} />
    <path d={`M0 ${-r * 0.55} V0 L${r * 0.42} ${r * 0.3}`} {...STROKE} stroke={hand} strokeWidth={4.5} />
  </g>
);

/* La carta: una hoja con renglones y un plato. */
export const MenuG = ({ x = 0, y = 0, s = 1, ...rest }: G & { x?: number; y?: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} {...STROKE} {...rest}>
    <rect x="0" y="0" width="56" height="74" rx="8" fill={PAPER} />
    <circle cx="28" cy="22" r="9" />
    <path d="M12 44 H44 M12 54 H38 M12 64 H42" strokeWidth={3.5} />
  </g>
);

/* Tarjeta de pago. */
export const CardG = ({ x = 0, y = 0, s = 1, fill = PAPER, ...rest }: G & { x?: number; y?: number; s?: number; fill?: string }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} {...STROKE} {...rest}>
    <rect x="0" y="0" width="70" height="46" rx="8" fill={fill} />
    <path d="M0 14 H70" strokeWidth={6} />
    <path d="M10 34 H28" strokeWidth={4} />
  </g>
);

/* Los números de turno: lo que sale de la caja, en fila. */
export const TurnChips = ({
  x = 0,
  y = 0,
  nums = ["41", "42", "43"],
  ...rest
}: G & { x?: number; y?: number; nums?: string[] }) => (
  <g transform={`translate(${x} ${y})`} {...rest}>
    {nums.map((n, i) => (
      <g key={n} transform={`translate(${i * 46} 0)`}>
        <rect x="0" y="0" width="38" height="46" rx="9" {...STROKE} fill={PAPER} />
        <text x="19" y="30" textAnchor="middle" fontFamily="var(--font-display)" fontSize="16" fill="currentColor">
          {n}
        </text>
      </g>
    ))}
  </g>
);

/* QR simplificado: los tres cuadrados de esquina y unos módulos. Se reconoce
 * como QR de lejos, que es lo único que tiene que hacer. */
export const Qr = ({ x = 0, y = 0, size = 40, ...rest }: G & { x?: number; y?: number; size?: number }) => {
  const k = size / 40;
  const finder = (fx: number, fy: number) => (
    <g key={`${fx}-${fy}`}>
      <rect x={fx} y={fy} width="12" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x={fx + 4} y={fy + 4} width="4" height="4" rx="1" fill="currentColor" />
    </g>
  );
  const dots = [
    [18, 2], [22, 6], [18, 10], [2, 18], [8, 22], [14, 18], [20, 18], [26, 18],
    [34, 18], [18, 24], [24, 26], [30, 22], [20, 32], [26, 34], [32, 30], [36, 36], [18, 36],
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} {...rest}>
      {finder(0, 0)}
      {finder(28, 0)}
      {finder(0, 28)}
      {dots.map(([dx, dy]) => (
        <rect key={`${dx}-${dy}`} x={dx} y={dy} width="4" height="4" rx="1" fill="currentColor" />
      ))}
    </g>
  );
};

/* Cartelito de mesa con el QR (el "table tent" que el local imprime). */
export const QrStand = ({ x = 0, y = 0, s = 1, ...rest }: G & { x?: number; y?: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} {...rest}>
    <path d="M6 70 L14 4 H56 L64 70 Z" {...STROKE} fill={PAPER} />
    <Qr x={19} y={18} size={32} />
  </g>
);

export const Cup = ({ x = 0, y = 0, s = 1, steam = true, ...rest }: G & { x?: number; y?: number; s?: number; steam?: boolean }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} {...STROKE} {...rest}>
    {steam && (
      <>
        <path d="M14 10 q-4 -6 0 -12" strokeWidth={4} />
        <path d="M26 10 q-4 -6 0 -12" strokeWidth={4} />
      </>
    )}
    <path d="M4 18 H36 V34 A12 12 0 0 1 24 46 H16 A12 12 0 0 1 4 34 Z" fill={PAPER} />
    <path d="M36 22 h3 a7 7 0 0 1 0 14 h-4" />
  </g>
);

export const Bag = ({ x = 0, y = 0, s = 1, label, ...rest }: G & { x?: number; y?: number; s?: number; label?: string }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} {...rest}>
    <path d="M6 16 H50 L46 70 H10 Z" {...STROKE} fill={PAPER} />
    <path d="M18 16 V10 a10 10 0 0 1 20 0 V16" {...STROKE} />
    {label && (
      <text
        x="28"
        y="50"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontSize="18"
        fill="currentColor"
      >
        {label}
      </text>
    )}
  </g>
);

/* El ticket de la cuenta, con el borde de abajo cortado. */
export const Ticket = ({ x = 0, y = 0, s = 1, ...rest }: G & { x?: number; y?: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} {...STROKE} {...rest}>
    <path d="M4 2 H44 V58 l-5 -5 l-5 5 l-5 -5 l-5 5 l-5 -5 l-5 5 l-5 -5 l-5 5 Z" fill={PAPER} />
    <path d="M12 16 H36" strokeWidth={3.5} />
    <path d="M12 26 H30" strokeWidth={3.5} />
    <path d="M12 36 H34" strokeWidth={3.5} />
  </g>
);

/* El buzzer de siempre, el aparato que Cicalino reemplaza. */
export const Buzzer = ({ x = 0, y = 0, s = 1, ...rest }: G & { x?: number; y?: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} {...STROKE} {...rest}>
    <rect x="2" y="10" width="44" height="44" rx="12" fill={PAPER} />
    <circle cx="24" cy="32" r="9" />
    <path d="M14 2 l-4 -6" strokeWidth={4} />
    <path d="M34 2 l4 -6" strokeWidth={4} />
  </g>
);

/* Mesa vista de frente: tapa y patas. */
export const TableG = ({ x = 0, y = 0, w = 160, ...rest }: G & { x?: number; y?: number; w?: number }) => (
  <g transform={`translate(${x} ${y})`} {...STROKE} {...rest}>
    <path d={`M0 0 H${w}`} strokeWidth={7} />
    <path d={`M${w * 0.18} 4 V60`} />
    <path d={`M${w * 0.82} 4 V60`} />
  </g>
);

/* Mostrador: tapa gruesa y frente con dos paneles. */
export const CounterG = ({ x = 0, y = 0, w = 220, h = 70, ...rest }: G & { x?: number; y?: number; w?: number; h?: number }) => (
  <g transform={`translate(${x} ${y})`} {...STROKE} {...rest}>
    <rect x="8" y="0" width={w - 16} height={h} rx="6" fill={PAPER} />
    <path d={`M0 0 H${w}`} strokeWidth={8} />
    <path d={`M${w / 2} 14 V${h - 14}`} strokeWidth={4} />
  </g>
);

/* Puerta abierta del local, con el cartelito de la entrada. */
export const DoorG = ({ x = 0, y = 0, ...rest }: G & { x?: number; y?: number }) => (
  <g transform={`translate(${x} ${y})`} {...STROKE} {...rest}>
    <path d="M0 150 V10 Q0 0 10 0 H80 Q90 0 90 10 V150" fill={PAPER} />
    <path d="M16 150 V22 H74 V150" />
    <circle cx="64" cy="88" r="3.5" fill="currentColor" />
  </g>
);

/* ---------------------------------------------------------------------------
 * Dispositivos (HTML) */

export const Phone = ({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) => (
  <div
    className={`relative flex aspect-[9/17] flex-col overflow-hidden rounded-[28px] border-[5px] border-marca bg-surface ${className}`}
  >
    <span className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-marca/80" aria-hidden />
    <div className="relative flex flex-1 flex-col px-3 pb-3 pt-2">{children}</div>
  </div>
);

export const Tablet = ({
  children,
  className = "",
  tabs,
}: {
  children?: ReactNode;
  className?: string;
  /* Las secciones del panel, con la activa marcada. Son los nombres reales
   * de la barra del panel. */
  tabs?: { label: string; active?: boolean }[];
}) => (
  <div
    className={`relative flex flex-col overflow-hidden rounded-[30px] border-[5px] border-marca bg-surface ${className}`}
  >
    {tabs && (
      <div className="flex items-center gap-1.5 border-b-[3px] border-marca/15 px-4 py-2.5">
        {tabs.map((t) => (
          <span
            key={t.label}
            className={`rounded-full px-3 py-1 text-[clamp(0.7rem,1.05vw,0.9rem)] font-bold ${
              t.active ? "bg-marca text-crema" : "text-marca/70"
            }`}
          >
            {t.label}
          </span>
        ))}
      </div>
    )}
    <div className="relative flex flex-1 flex-col gap-2 p-3 sm:p-4">{children}</div>
  </div>
);

/* Una fila del panel o del celular: lo que el local ve llegar. */
export const Row = ({
  children,
  tone = "marca",
  className = "",
  style,
}: {
  children: ReactNode;
  tone?: "marca" | "espera" | "pagos" | "ok" | "curso";
  className?: string;
  style?: CSSProperties;
}) => {
  const tones = {
    marca: "border-marca/30 text-marca",
    espera: "border-espera/40 text-espera",
    pagos: "border-pagos/40 text-pagos",
    ok: "border-ok/40 bg-ok-fondo text-ok",
    curso: "border-curso/30 bg-curso-fondo text-curso",
  } as const;
  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border-[2.5px] bg-crema/60 px-3 py-2 text-[clamp(0.78rem,1.25vw,1.05rem)] font-semibold ${tones[tone]} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
};

/* El aviso del sistema que le aparece al cliente en el celular. */
export const Notification = ({
  title,
  className = "",
  style,
  compact = false,
}: {
  title: string;
  className?: string;
  style?: CSSProperties;
  /* Para dentro de un celular dibujado: sin la línea de arriba y con el
   * ícono más chico, que el ancho es poco. */
  compact?: boolean;
}) => (
  <div
    className={`flex items-center rounded-2xl border-[2.5px] border-marca bg-crema ${compact ? "gap-1.5 px-1.5 py-1.5" : "gap-2 px-2.5 py-2"} ${className}`}
    style={style}
  >
    {compact ? (
      <span className="size-2 shrink-0 rounded-full bg-marca" aria-hidden />
    ) : (
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-marca">
        <MascotImg pose="bell" className="w-5 brightness-0 invert" />
      </span>
    )}
    <span className="min-w-0 text-left leading-tight">
      {!compact && (
        <span className="block text-[0.62rem] font-bold uppercase tracking-wide text-marca/70">
          Cicalino · ahora
        </span>
      )}
      <span className={`block font-bold text-carbon ${compact ? "text-[0.62rem]" : "text-[clamp(0.72rem,1.1vw,0.92rem)]"}`}>
        {title}
      </span>
    </span>
  </div>
);

/* Un QR "de verdad" en HTML (para dentro de un celular o un cartel). */
export const QrBox = ({ className = "", size = 64 }: { className?: string; size?: number }) => (
  <svg viewBox="-4 -4 48 48" width={size} height={size} className={`text-marca ${className}`} aria-hidden>
    <rect x="-4" y="-4" width="48" height="48" rx="6" fill="var(--surface)" />
    <Qr />
  </svg>
);

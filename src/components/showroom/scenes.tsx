"use client";

/* Plantillas de escena. Cada recorrido (tours.tsx) se arma con estas piezas,
 * así un tema nuevo es contenido y no otra pantalla.
 *
 * Regla de todas: un título, una idea y un dibujo. Lo demás lo cuenta quien
 * presenta. */

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { MascotImg, type MascotPose } from "./art";

/* ---------------------------------------------------------------------------
 * Navegación disponible para las escenas (el cierre tiene botones). */

export type ShowNav = {
  toSelector: () => void;
  startTour: (id: string) => void;
  restart: () => void;
  tourId: string;
};

export const ShowNavContext = createContext<ShowNav | null>(null);
export const useShowNav = () => {
  const ctx = useContext(ShowNavContext);
  if (!ctx) throw new Error("useShowNav fuera de la presentación");
  return ctx;
};

/* `--d` en segundos, para escalonar la aparición. */
export const d = (s: number): CSSProperties => ({ "--d": `${s}s` }) as CSSProperties;

/* ---------------------------------------------------------------------------
 * Piezas */

export type Tone = "marca" | "espera" | "pagos";

const TONE_TEXT: Record<Tone, string> = {
  marca: "text-marca",
  espera: "text-espera",
  pagos: "text-pagos",
};
const TONE_SOFT: Record<Tone, string> = {
  marca: "bg-marca/8",
  espera: "bg-espera/10",
  pagos: "bg-pagos/8",
};
const TONE_BG: Record<Tone, string> = {
  marca: "bg-marca",
  espera: "bg-espera",
  pagos: "bg-pagos",
};

export const Kicker = ({ children, tone = "marca", delay = 0 }: { children: ReactNode; tone?: Tone; delay?: number }) => (
  <p
    className={`show-in flex items-center justify-center gap-2 text-[clamp(0.75rem,1.1vw,0.95rem)] font-semibold uppercase tracking-[0.3em] ${TONE_TEXT[tone]}`}
    style={d(delay)}
  >
    <span className={`size-2 rounded-full ${TONE_BG[tone]}`} aria-hidden />
    {children}
  </p>
);

export const SceneTitle = ({
  title,
  lead,
  kicker,
  tone,
  align = "center",
  delay = 0,
}: {
  title: ReactNode;
  lead?: ReactNode;
  kicker?: ReactNode;
  tone?: Tone;
  align?: "center" | "left";
  delay?: number;
}) => (
  <div className={`flex flex-col gap-3 ${align === "center" ? "items-center text-center" : "items-start text-left"}`}>
    {kicker && (
      <Kicker tone={tone} delay={delay}>
        {kicker}
      </Kicker>
    )}
    <h2 className="show-h1 show-in max-w-[18ch]" style={d(delay + 0.08)}>
      {title}
    </h2>
    {lead && (
      <p className={`show-lead show-in max-w-[38ch] ${align === "center" ? "" : ""}`} style={d(delay + 0.2)}>
        {lead}
      </p>
    )}
  </div>
);

/* Globo de diálogo, con la colita abajo. */
export const Bubble = ({
  children,
  tail = "left",
  className = "",
  style,
  tone = "marca",
}: {
  children: ReactNode;
  tail?: "left" | "right" | "none";
  className?: string;
  style?: CSSProperties;
  tone?: Tone;
}) => (
  <div className={`show-pop absolute ${className}`} style={style}>
    <div
      className={`relative rounded-[22px] border-[3.5px] bg-surface px-4 py-2 text-[clamp(0.85rem,1.5vw,1.3rem)] font-bold leading-tight ${
        tone === "marca" ? "border-marca text-marca" : tone === "espera" ? "border-espera text-espera" : "border-pagos text-pagos"
      }`}
    >
      {children}
      {tail !== "none" && (
        <svg
          viewBox="0 0 24 18"
          className={`absolute -bottom-[15px] w-6 ${tail === "left" ? "left-6" : "right-6 -scale-x-100"} ${TONE_TEXT[tone]}`}
          aria-hidden
        >
          <path d="M2 0 L4 16 L20 0" fill="var(--surface)" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M3 -1 H19" stroke="var(--surface)" strokeWidth="4" />
        </svg>
      )}
    </div>
  </div>
);

/* La línea que une un paso con el siguiente. Se dibuja y después la recorre
 * un punto: "esto va de acá para allá". En pantallas angostas los pasos van
 * en columna y la línea gira con ellos. */
export const Connector = ({ delay = 0, tone = "marca", className = "" }: { delay?: number; tone?: Tone; className?: string }) => (
  <svg
    viewBox="0 0 80 24"
    className={`w-[clamp(2.5rem,6vw,5.5rem)] shrink-0 max-sm:my-1 max-sm:rotate-90 ${TONE_TEXT[tone]} ${className}`}
    aria-hidden
  >
    <path
      d="M4 12 H70"
      pathLength={1}
      className="show-draw"
      style={{ ...d(delay), "--t": "0.6s" } as CSSProperties}
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <path
      d="M62 4 L72 12 L62 20"
      className="show-in"
      style={d(delay + 0.45)}
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle r="5" fill="currentColor" opacity="0">
      <animate attributeName="opacity" values="0;1;1;0" dur="1.8s" begin={`${delay + 0.8}s`} repeatCount="indefinite" />
      <animateMotion path="M4 12 H66" dur="1.8s" begin={`${delay + 0.8}s`} repeatCount="indefinite" />
    </circle>
  </svg>
);

/* ---------------------------------------------------------------------------
 * Plantillas */

/* Marco común: centra el contenido y le da aire. */
export const SceneFrame = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`mx-auto flex min-h-full w-full max-w-6xl flex-col items-center justify-center-safe gap-[clamp(1.25rem,4vh,3rem)] px-5 sm:px-10 ${className}`}>
    {children}
  </div>
);

/* Una afirmación fuerte con la mascota. Para abrir y para "cómo lo resuelve". */
export const Statement = ({
  pose,
  title,
  lead,
  kicker,
  tone,
  ring = false,
  side,
}: {
  pose: MascotPose;
  title: ReactNode;
  lead?: ReactNode;
  kicker?: ReactNode;
  tone?: Tone;
  ring?: boolean;
  /* Algo para el costado de la mascota (un QR, un celular). */
  side?: ReactNode;
}) => (
  <SceneFrame className="sm:flex-row sm:gap-[clamp(2rem,6vw,6rem)]">
    <div className="show-pop relative flex shrink-0 items-center justify-center" style={d(0.05)}>
      <span className="absolute size-[78%] rounded-full bg-marca/8" aria-hidden />
      <div className={ring ? "show-ring" : "show-float"} style={d(0.7)}>
        <MascotImg pose={pose} className="relative w-[clamp(9rem,24vw,20rem)]" />
      </div>
      {side}
    </div>
    <div className="sm:max-w-[44%]">
      <SceneTitle title={title} lead={lead} kicker={kicker} tone={tone} align="left" delay={0.15} />
    </div>
  </SceneFrame>
);

/* El problema: tres situaciones de todos los días, cada una en su bloque.
 * Una frase que el dueño escuchó mil veces y una línea de contexto. Sin
 * dramatizar: no es que el local ande mal, es que el cliente espera. */
export const Problem = ({
  title,
  kicker,
  tone = "marca",
  items,
  foot,
}: {
  title: ReactNode;
  kicker?: ReactNode;
  tone?: Tone;
  items: { art: ReactNode; quote: ReactNode; sub: ReactNode }[];
  foot?: ReactNode;
}) => (
  <SceneFrame>
    <SceneTitle title={title} kicker={kicker} tone={kicker ? tone : undefined} />
    <ul className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-[clamp(0.75rem,2vw,1.5rem)]">
      {items.map((it, i) => (
        <li
          key={i}
          className="show-in flex items-center gap-4 rounded-[28px] border-2 border-linea bg-surface p-4 sm:flex-col sm:gap-3 sm:p-[clamp(1rem,2.2vw,1.75rem)] sm:text-center"
          style={d(0.45 + i * 0.55)}
        >
          <div className={`relative grid h-[clamp(4.5rem,15vh,8.5rem)] shrink-0 place-items-center ${TONE_TEXT[tone]}`}>
            <span className={`absolute aspect-square h-[92%] rounded-full ${TONE_SOFT[tone]}`} aria-hidden />
            <div className="relative h-full">{it.art}</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="show-h2 text-carbon">{it.quote}</p>
            <p className="text-[clamp(0.9rem,1.3vw,1.1rem)] font-medium leading-snug text-suave">{it.sub}</p>
          </div>
        </li>
      ))}
    </ul>
    {foot && (
      <p className="show-lead show-in text-center" style={d(0.45 + items.length * 0.55 + 0.2)}>
        {foot}
      </p>
    )}
  </SceneFrame>
);

/* Un recorrido en pasos: dibujo + una frase, unidos por líneas. */
export const Flow = ({
  title,
  lead,
  kicker,
  tone = "marca",
  steps,
  note,
}: {
  title: ReactNode;
  lead?: ReactNode;
  kicker?: ReactNode;
  tone?: Tone;
  steps: { visual: ReactNode; label: ReactNode }[];
  note?: ReactNode;
}) => {
  const step = 0.9;
  const start = 0.45;
  return (
    <SceneFrame>
      <SceneTitle title={title} lead={lead} kicker={kicker} tone={kicker ? tone : undefined} />
      {/* En el celular, de a dos por fila y sin flechas: en columna no entra. */}
      <ol className="grid w-full grid-cols-2 justify-items-center gap-x-3 gap-y-5 [--flow-h:10rem] sm:flex sm:items-start sm:justify-center sm:[--flow-h:clamp(9rem,31vh,17rem)]">
        {steps.map((s, i) => (
          <li key={i} className="contents">
            {i > 0 && (
              <Connector
                delay={start + i * step - 0.45}
                tone={tone}
                className="max-sm:hidden sm:mt-[calc(var(--flow-h)/2-12px)]"
              />
            )}
            <div
              className={`show-in flex flex-col items-center gap-3 text-center ${steps.length > 3 ? "sm:w-[clamp(8rem,17vw,13rem)]" : "sm:w-[clamp(9rem,19vw,15rem)]"}`}
              style={d(start + i * step)}
            >
              <div className="flex h-(--flow-h) items-center justify-center">{s.visual}</div>
              <p className="show-h2 text-carbon">{s.label}</p>
            </div>
          </li>
        ))}
      </ol>
      {note && (
        <p className={`show-in rounded-full bg-marca/8 px-5 py-2.5 text-center text-[clamp(0.9rem,1.4vw,1.15rem)] font-semibold ${TONE_TEXT[tone]}`} style={d(start + steps.length * step)}>
          {note}
        </p>
      )}
    </SceneFrame>
  );
};

/* Lo que gana el local: hasta cuatro, cada uno con su dibujo. */
export const Benefits = ({
  title,
  kicker,
  tone,
  items,
}: {
  title: ReactNode;
  kicker?: ReactNode;
  tone?: Tone;
  items: { art: ReactNode; title: ReactNode; sub: ReactNode }[];
}) => (
  <SceneFrame>
    <SceneTitle title={title} kicker={kicker} tone={tone} />
    <ul
      className={`grid w-full gap-3 sm:gap-[clamp(0.75rem,1.6vw,1.25rem)] ${
        items.length === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"
      }`}
    >
      {items.map((it, i) => (
        <li
          key={i}
          className="show-in flex flex-col items-center gap-2 rounded-[28px] border-2 border-linea bg-surface p-4 text-center sm:p-[clamp(1rem,2vw,1.5rem)]"
          style={d(0.45 + i * 0.5)}
        >
          <div className="flex h-[clamp(4.5rem,14vh,8rem)] items-center justify-center text-marca">{it.art}</div>
          <p className="show-h2 text-marca">{it.title}</p>
          <p className="max-w-[22ch] text-[clamp(0.9rem,1.35vw,1.15rem)] font-medium text-suave">{it.sub}</p>
        </li>
      ))}
    </ul>
  </SceneFrame>
);

/* El cierre: siempre termina en la demo real. */
export const Closing = ({
  title,
  question,
  full = false,
}: {
  title: ReactNode;
  question: ReactNode;
  /* La presentación completa ofrece elegir un tema; un tema ofrece la
   * presentación completa. */
  full?: boolean;
}) => {
  const nav = useShowNav();
  return (
    <SceneFrame>
      <div className="show-pop relative" style={d(0.05)}>
        <span className="absolute inset-[12%] rounded-full bg-marca/8" aria-hidden />
        <div className="show-float">
          <MascotImg pose="ok" className="relative w-[clamp(8rem,20vw,15rem)]" />
        </div>
      </div>
      <h2 className="show-h1 show-in text-center" style={d(0.3)}>
        {title}
      </h2>
      <p className="show-in text-center font-display text-[clamp(1.3rem,2.8vw,2.4rem)] uppercase leading-tight tracking-tight text-carbon" style={d(1.3)}>
        {question}
      </p>
      <div className="show-in flex flex-col items-center gap-3 sm:flex-row" style={d(1.9)}>
        <a
          href="/panel"
          className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-marca px-9 text-lg font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
        >
          Ver el producto real
          <span aria-hidden>→</span>
        </a>
        {full ? (
          <button
            type="button"
            onClick={nav.toSelector}
            className="flex min-h-14 items-center justify-center rounded-full border-2 border-marca px-7 text-base font-semibold text-marca transition hover:bg-marca hover:text-crema active:scale-95"
          >
            Ver un tema en detalle
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={nav.toSelector}
              className="flex min-h-14 items-center justify-center rounded-full border-2 border-marca px-7 text-base font-semibold text-marca transition hover:bg-marca hover:text-crema active:scale-95"
            >
              Elegir otro tema
            </button>
            <button
              type="button"
              onClick={() => nav.startTour("completa")}
              className="min-h-12 px-4 text-sm font-semibold text-marca/80 underline-offset-4 hover:underline"
            >
              Ver la presentación completa
            </button>
          </>
        )}
      </div>
      <p className="show-in text-center text-sm text-suave" style={d(2.2)}>
        Probá gratis 30 días. No pedimos tarjeta.
      </p>
    </SceneFrame>
  );
};

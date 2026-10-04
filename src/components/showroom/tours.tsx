"use client";

/* Los recorridos. Uno completo y uno por tema; todos con las mismas
 * plantillas. Para sumar un tema: una entrada en TOURS y una estación en el
 * selector (Selector.tsx).
 *
 * El contenido sale del producto real (ver docs/como-funciona.md): nada de
 * lo que dice acá existe solo en la presentación. */

import type { ReactNode } from "react";
import { MascotImg, Notification, Phone, QrBox, Row } from "./art";
import { Benefits, Closing, d, Flow, Problem, Statement, type Tone } from "./scenes";
import {
  BenefitArt,
  ChangeScene,
  ConnectedScene,
  LocalSideScene,
  MiniPanel,
  MomentsScene,
  OrderCard,
  PhoneAlert,
  PhoneChoose,
  PhoneScan,
  SITUACION,
  SituationArt,
  TableWithQr,
} from "./visuals";

export type Scene = { id: string; render: () => ReactNode };

export type TourId = "completa" | "pedidos" | "celular" | "recepcion" | "pagos";

export type Tour = {
  id: TourId;
  /* Cómo se llama en la barra de abajo. */
  label: string;
  tone: Tone;
  scenes: Scene[];
};

/* ---------------------------------------------------------------------------
 * Piezas compartidas entre recorridos */

const phoneHeight = "h-full";

const PhoneOrder = () => (
  <Phone className={phoneHeight}>
    <p className="text-center text-[0.68rem] font-bold text-marca">Carta</p>
    <div className="mt-2 flex flex-col gap-1.5 text-[0.68rem] font-semibold text-carbon">
      {[
        ["Café con leche", "+"],
        ["Medialunas x3", "+"],
        ["Tostado", "+"],
      ].map(([n, a]) => (
        <span key={n} className="flex items-center justify-between border-b-2 border-linea pb-1">
          {n}
          <span className="grid size-4 place-items-center rounded-full bg-marca text-[0.6rem] text-crema">{a}</span>
        </span>
      ))}
    </div>
    <span className="mt-auto rounded-full bg-marca py-1.5 text-center text-[0.68rem] font-bold text-crema">
      Confirmar pedido
    </span>
  </Phone>
);

const PhonePay = () => (
  <Phone className={phoneHeight}>
    <p className="text-center text-[0.68rem] font-bold text-marca">Pagar</p>
    <div className="mt-2 flex flex-1 flex-col justify-center gap-1.5">
      {["Mercado Pago", "En caja"].map((m) => (
        <span key={m} className="rounded-full border-[2.5px] border-marca py-1 text-center text-[0.68rem] font-bold text-marca">
          {m}
        </span>
      ))}
    </div>
  </Phone>
);

const PhoneWaitlist = () => (
  <Phone className={phoneHeight}>
    <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
      <span className="text-[0.62rem] font-bold uppercase tracking-wide text-espera">En la lista</span>
      <span className="font-display text-[clamp(1.2rem,2.3vw,1.8rem)] leading-none text-espera">García</span>
      <span className="text-[0.66rem] font-semibold text-suave">4 personas</span>
      <span className="mt-1 text-[0.62rem] font-semibold text-suave">Te avisamos acá</span>
    </div>
  </Phone>
);

const PhoneSplit = () => (
  <Phone className={phoneHeight}>
    <p className="text-center text-[0.68rem] font-bold text-pagos">Mesa 12</p>
    <div className="mt-2 flex flex-col gap-1 text-[0.64rem] font-semibold text-carbon">
      <span className="flex justify-between">
        <span>Juan</span>
        <span className="text-ok">Pagó</span>
      </span>
      <span className="flex justify-between">
        <span>María (vos)</span>
        <span className="text-curso">Falta</span>
      </span>
    </div>
    <div className="mt-auto flex flex-col gap-1">
      {["Lo mío", "Partes iguales"].map((m) => (
        <span key={m} className="rounded-full border-[2.5px] border-pagos py-0.5 text-center text-[0.64rem] font-bold text-pagos">
          {m}
        </span>
      ))}
      <span className="rounded-full bg-pagos py-1 text-center text-[0.64rem] font-bold text-crema">Pagar mi parte</span>
    </div>
  </Phone>
);

const PhoneName = () => (
  <Phone className={phoneHeight}>
    <p className="text-center text-[0.68rem] font-bold text-pagos">Mesa 12</p>
    <div className="flex flex-1 flex-col justify-center gap-1.5">
      <span className="text-center text-[0.66rem] font-bold text-carbon">¿Cómo te llamás?</span>
      <span className="rounded-lg border-2 border-linea bg-crema px-2 py-1 text-[0.68rem] font-semibold text-carbon">María</span>
      <span className="rounded-full bg-pagos py-1 text-center text-[0.64rem] font-bold text-crema">Entrar a la mesa</span>
    </div>
  </Phone>
);

/* Mesa abierta en el panel de Pagos: total, pagado y lo que falta. */
const BillPanel = () => (
  <MiniPanel tab="Pagos">
    <p className="text-center font-display text-[clamp(0.9rem,1.5vw,1.2rem)] uppercase text-pagos">Mesa 12</p>
    {[
      ["Total", "$31.050", "text-carbon"],
      ["Pagado", "$13.200", "text-ok"],
      ["Falta", "$17.850", "text-pagos"],
    ].map(([k, v, c]) => (
      <span key={k} className="flex justify-between text-[clamp(0.68rem,1vw,0.85rem)] font-bold">
        <span className="text-suave">{k}</span>
        <span className={c}>{v}</span>
      </span>
    ))}
  </MiniPanel>
);

/* ---------------------------------------------------------------------------
 * Presentación completa */

const COMPLETA: Tour = {
  id: "completa",
  label: "Presentación completa",
  tone: "marca",
  scenes: [
    {
      id: "hola",
      render: () => (
        <Statement
          pose="bell"
          ring
          title="Avisamos el momento justo."
          lead="Cicalino conecta el celular de tu cliente con tu local. Con un QR."
        />
      ),
    },
    {
      id: "problema",
      render: () => (
        <Problem
          title="Pasa en todos los locales."
          items={[
            { art: <SituationArt>{SITUACION.pedidoListo}</SituationArt>, quote: "¿Ya está mi pedido?", sub: "El cliente se acerca a preguntar." },
            { art: <SituationArt>{SITUACION.puerta}</SituationArt>, quote: "¿Falta mucho para la mesa?", sub: "Se espera en la puerta, sin saber cuánto." },
            { art: <SituationArt>{SITUACION.cuenta}</SituationArt>, quote: "¿Me traés la cuenta?", sub: "Para pagar, hay que esperar que alguien se acerque." },
          ]}
          foot="Son minutos que el cliente siente. Y que tu equipo puede usar mejor."
        />
      ),
    },
    { id: "cambio", render: () => <ChangeScene /> },
    {
      id: "cliente",
      render: () => (
        <Flow
          title="El cliente no instala nada."
          lead="Usa la cámara del celular que ya tiene."
          steps={[
            { visual: <TableWithQr />, label: "Escanea el QR" },
            { visual: <PhoneScan />, label: "Sin apps ni registro" },
            { visual: <PhoneChoose />, label: "Pide, espera o paga" },
            { visual: <PhoneAlert title="Pedido 42 listo para retirar" big="42" delay={3.6} />, label: "Le llega el aviso" },
          ]}
        />
      ),
    },
    { id: "local", render: () => <LocalSideScene /> },
    { id: "momentos", render: () => <MomentsScene /> },
    { id: "conectado", render: () => <ConnectedScene /> },
    {
      id: "beneficios",
      render: () => (
        <Benefits
          title="Lo que cambia."
          items={[
            { art: BenefitArt.ping, title: "El aviso llega solo", sub: "Al celular del cliente, sin llamarlo." },
            { art: BenefitArt.noBuzzer, title: "Sin buzzers ni apps", sub: "Usa el celular que ya tienen." },
            { art: BenefitArt.splitBill, title: "Pagar es más simple", sub: "Cada uno paga su parte desde el celular." },
            { art: BenefitArt.bell, title: "Menos idas y vueltas", sub: "Pedidos, llamados y cuentas llegan solos al panel." },
          ]}
        />
      ),
    },
    {
      id: "cierre",
      render: () => <Closing full title="Esto es Cicalino." question="¿Lo vemos funcionando en tu local?" />,
    },
  ],
};

/* ---------------------------------------------------------------------------
 * Pedidos — el mostrador (modalidad tradicional) */

const PEDIDOS: Tour = {
  id: "pedidos",
  label: "Pedidos",
  tone: "marca",
  scenes: [
    {
      id: "problema",
      render: () => (
        <Problem
          kicker="Pedidos"
          title="Esperar el pedido."
          items={[
            { art: <SituationArt>{SITUACION.pedidoListo}</SituationArt>, quote: "¿Ya está el 42?", sub: "El cliente se queda cerca del mostrador, por las dudas." },
            { art: <SituationArt>{SITUACION.vozAlta}</SituationArt>, quote: "Llamar en voz alta", sub: "Con el local lleno, no siempre se escucha." },
            { art: <SituationArt>{SITUACION.buzzer}</SituationArt>, quote: "Los buzzers", sub: "Se descargan, se rompen o no vuelven." },
          ]}
        />
      ),
    },
    {
      id: "solucion",
      render: () => (
        <Statement
          pose="phone"
          kicker="Pedidos"
          title="Chau buzzer. Hola QR."
          lead="La caja carga el pedido como siempre y le pasa un QR al cliente. Cuando está listo, le avisás al celular."
        />
      ),
    },
    {
      id: "cliente",
      render: () => (
        <Flow
          kicker="El cliente"
          title="Espera tranquilo."
          steps={[
            { visual: <PhoneScan />, label: "Escanea el QR" },
            {
              visual: (
                <Phone className={phoneHeight}>
                  <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
                    <span className="text-[0.62rem] font-bold uppercase tracking-wide text-curso">Preparando</span>
                    <span className="font-display text-[clamp(1.8rem,3.5vw,2.8rem)] leading-none text-marca">42</span>
                    <MascotImg pose="chef" className="show-float mt-1 w-10" />
                  </div>
                </Phone>
              ),
              label: "Deja la pantalla abierta",
            },
            { visual: <PhoneAlert title="Pedido 42 listo para retirar" big="42" delay={2.6} />, label: "Le llega el aviso" },
          ]}
          note="No instala nada. Con o sin notificaciones."
        />
      ),
    },
    {
      id: "local",
      render: () => (
        <Flow
          kicker="Tu local"
          title="Tres toques en el mostrador."
          steps={[
            {
              visual: (
                <MiniPanel>
                  <span className="rounded-full bg-marca py-1.5 text-center text-[clamp(0.68rem,1vw,0.85rem)] font-bold text-crema">
                    + Nuevo pedido
                  </span>
                  <div className="flex flex-wrap justify-center gap-1">
                    {["42", "Sofía", "Mesa 5"].map((id) => (
                      <span key={id} className="rounded-full border-2 border-marca/30 px-2 py-0.5 text-[0.62rem] font-bold text-marca">
                        {id}
                      </span>
                    ))}
                  </div>
                  <QrBox size={44} className="mx-auto" />
                </MiniPanel>
              ),
              label: "Cargás el pedido",
            },
            { visual: <MiniPanel><OrderCard n="42" state="curso" action="Listo · avisar" delay={1.8} /></MiniPanel>, label: "Listo · avisar" },
            { visual: <MiniPanel><OrderCard n="42" state="retirado" /></MiniPanel>, label: "Retirado" },
          ]}
          note="Sin carta: lo carga la caja y lo identificás con un número, el nombre o la mesa."
        />
      ),
    },
    {
      id: "beneficio",
      render: () => (
        <Benefits
          kicker="Pedidos"
          title="Lo que gana el mostrador."
          items={[
            { art: BenefitArt.ping, title: "El aviso llega solo", sub: "El cliente se entera en el celular." },
            { art: BenefitArt.noBuzzer, title: "Sin aparatos", sub: "Nada que se rompa, se cargue o se lleven." },
            { art: BenefitArt.clock, title: "Tus tiempos, medidos", sub: "Preparación y retiro, en tus métricas." },
          ]}
        />
      ),
    },
    { id: "cierre", render: () => <Closing title="Chau buzzer." question="¿Lo vemos en tu mostrador?" /> },
  ],
};

/* ---------------------------------------------------------------------------
 * Pedidos desde el celular — Mostrador QR y Mesa */

const CELULAR: Tour = {
  id: "celular",
  label: "Pedidos desde el celular",
  tone: "marca",
  scenes: [
    {
      id: "problema",
      render: () => (
        <Problem
          kicker="Pedidos desde el celular"
          title="Esperar para pedir."
          items={[
            { art: <SituationArt>{SITUACION.fila}</SituationArt>, quote: "La fila en la caja", sub: "En hora pico, pedir lleva más que preparar." },
            { art: <SituationArt>{SITUACION.dictar}</SituationArt>, quote: "Dictar el pedido", sub: "Se dice, se escucha y se carga a mano." },
            { art: <SituationArt>{SITUACION.mesaEspera}</SituationArt>, quote: "Esperar en la mesa", sub: "Hasta que alguien se acerque a tomar el pedido." },
          ]}
        />
      ),
    },
    {
      id: "solucion",
      render: () => (
        <Statement
          pose="phone"
          kicker="Pedidos desde el celular"
          title="El cliente pide solo. Vos preparás."
          lead="Con tu carta en el celular: un QR en el mostrador, o uno en cada mesa. Las dos formas se pueden usar juntas."
        />
      ),
    },
    {
      id: "cliente",
      render: () => (
        <Flow
          kicker="El cliente"
          title="Pide y paga desde el celular."
          steps={[
            { visual: <TableWithQr />, label: "Escanea el QR" },
            { visual: <PhoneOrder />, label: "Elige de la carta" },
            { visual: <PhonePay />, label: "Paga como prefiera" },
            { visual: <PhoneAlert title="Pedido 57 listo para retirar" big="57" delay={3.6} />, label: "Le avisamos" },
          ]}
        />
      ),
    },
    {
      id: "local",
      render: () => (
        <Flow
          kicker="Tu local"
          title="El pedido entra solo al tablero."
          steps={[
            {
              visual: (
                <MiniPanel>
                  <Row className="text-[0.75rem]">
                    <span className="size-2 shrink-0 rounded-full bg-marca" aria-hidden />
                    Pedido 57 · Mesa 4
                  </Row>
                </MiniPanel>
              ),
              label: "Llega escrito por el cliente",
            },
            { visual: <MiniPanel><OrderCard n="57" state="curso" action="Listo · avisar" delay={1.8} /></MiniPanel>, label: "Lo preparás" },
            { visual: <MiniPanel><OrderCard n="57" state="ok" /></MiniPanel>, label: "Lo retira en el mostrador" },
          ]}
          note="En el mostrador entra al toque. En la mesa, cuando está pago."
        />
      ),
    },
    {
      id: "beneficio",
      render: () => (
        <Benefits
          kicker="Pedidos desde el celular"
          title="Lo que gana la caja."
          items={[
            { art: BenefitArt.queue, title: "Menos fila", sub: "Cada uno pide desde donde está." },
            { art: BenefitArt.cup, title: "Pedidos claros", sub: "Los escribe el cliente, no hay que repetirlos." },
            { art: BenefitArt.check, title: "Nada sin cobrar", sub: "En la mesa no se prepara hasta que está pago." },
          ]}
        />
      ),
    },
    { id: "cierre", render: () => <Closing title="Pide solo. Vos preparás." question="¿Lo vemos con tu carta?" /> },
  ],
};

/* ---------------------------------------------------------------------------
 * Recepción — la puerta */

const RECEPCION: Tour = {
  id: "recepcion",
  label: "Recepción",
  tone: "espera",
  scenes: [
    {
      id: "problema",
      render: () => (
        <Problem
          kicker="Recepción"
          tone="espera"
          title="Esperar la mesa."
          items={[
            { art: <SituationArt>{SITUACION.puerta}</SituationArt>, quote: "¿Cuánto falta?", sub: "El grupo espera en la puerta, sin saber cuánto." },
            { art: <SituationArt>{SITUACION.lista}</SituationArt>, quote: "La lista de espera", sub: "Se lleva de palabra o en un papel." },
            { art: <SituationArt>{SITUACION.mesaLibre}</SituationArt>, quote: "¿A quién le toca?", sub: "Se libera una mesa y hay que salir a buscar al grupo." },
          ]}
        />
      ),
    },
    {
      id: "solucion",
      render: () => (
        <Statement
          pose="phone"
          kicker="Recepción"
          tone="espera"
          title="Esperan donde quieran. Vos avisás."
          lead="Anotás al grupo y le pasás un QR. Cuando hay mesa, le llega el aviso."
        />
      ),
    },
    {
      id: "cliente",
      render: () => (
        <Flow
          kicker="El cliente"
          tone="espera"
          title="Sin quedarse en la puerta."
          steps={[
            { visual: <PhoneScan />, label: "Escanea el QR" },
            { visual: <PhoneWaitlist />, label: "Queda en la lista" },
            {
              visual: (
                <Phone className={phoneHeight}>
                  <Notification title="García, ¡tu mesa está lista!" compact className="show-drop" style={d(2.6)} />
                  <div className="flex flex-1 flex-col items-center justify-center">
                    <span className="font-display text-[clamp(1.2rem,2.3vw,1.8rem)] leading-none text-espera">Mesa 7</span>
                  </div>
                </Phone>
              ),
              label: "Le avisás que pase",
            },
          ]}
        />
      ),
    },
    {
      id: "local",
      render: () => (
        <Flow
          kicker="Tu local"
          tone="espera"
          title="La cola y el salón, en una pantalla."
          steps={[
            {
              visual: (
                <MiniPanel tab="Recepción">
                  <Row tone="espera" className="text-[0.75rem]">García · 4</Row>
                  <Row tone="espera" className="text-[0.75rem]">López · 2</Row>
                </MiniPanel>
              ),
              label: "Esperando",
            },
            {
              visual: (
                <MiniPanel tab="Recepción">
                  <Row tone="espera" className="show-beat text-[0.75rem]">García · Avisado</Row>
                  <Row tone="espera" className="text-[0.75rem]">López · 2</Row>
                </MiniPanel>
              ),
              label: "Avisado",
            },
            {
              visual: (
                <MiniPanel tab="Recepción">
                  <div className="grid grid-cols-3 gap-1.5">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <span
                        key={n}
                        className={`grid aspect-square place-items-center rounded-lg border-[2.5px] text-[0.7rem] font-bold ${
                          n === 4 || n === 2 ? "border-espera bg-espera text-crema" : "border-espera/40 text-espera"
                        }`}
                      >
                        {n === 4 ? "7" : n}
                      </span>
                    ))}
                  </div>
                </MiniPanel>
              ),
              label: "Sentado",
            },
          ]}
          note="Con el mapa de mesas y las reservas del día, en el mismo panel."
        />
      ),
    },
    {
      id: "beneficio",
      render: () => (
        <Benefits
          kicker="Recepción"
          tone="espera"
          title="Lo que gana la puerta."
          items={[
            { art: BenefitArt.queue, title: "Nadie se agolpa", sub: "Esperan afuera, en la barra o a la vuelta." },
            { art: BenefitArt.tables, title: "El salón de un vistazo", sub: "Mesas libres y ocupadas, al toque." },
            { art: BenefitArt.calendar, title: "Reservas incluidas", sub: "Las del día, en el mismo panel." },
          ]}
        />
      ),
    },
    { id: "cierre", render: () => <Closing title="Hay mesa." question="¿Lo vemos con tu salón?" /> },
  ],
};

/* ---------------------------------------------------------------------------
 * Pagos divididos — la mesa */

const PAGOS: Tour = {
  id: "pagos",
  label: "Pagos divididos",
  tone: "pagos",
  scenes: [
    {
      id: "problema",
      render: () => (
        <Problem
          kicker="Pagos divididos"
          tone="pagos"
          title="Esperar para pagar."
          items={[
            { art: <SituationArt>{SITUACION.cuenta}</SituationArt>, quote: "¿Me traés la cuenta?", sub: "La mesa ya terminó y espera que alguien se acerque." },
            { art: <SituationArt>{SITUACION.unoPaga}</SituationArt>, quote: "Uno paga todo", sub: "La cuenta se paga junta, con un solo medio de pago." },
            { art: <SituationArt>{SITUACION.cuantoTeDebo}</SituationArt>, quote: "¿Cuánto te debo?", sub: "Después hay que sacar cuánto le pasa cada uno." },
          ]}
        />
      ),
    },
    {
      id: "solucion",
      render: () => (
        <Statement
          pose="ok"
          kicker="Pagos divididos"
          tone="pagos"
          title="Cada uno paga lo suyo."
          lead="Desde el QR de la mesa: ven la carta, piden, y al final cada uno paga su parte, sin esperar a que le traigan la cuenta."
        />
      ),
    },
    {
      id: "cliente",
      render: () => (
        <Flow
          kicker="La mesa"
          tone="pagos"
          title="Todo desde el celular."
          steps={[
            { visual: <TableWithQr />, label: "Escanea el QR de la mesa" },
            { visual: <PhoneName />, label: "Pone su nombre" },
            { visual: <PhoneOrder />, label: "Pide de la carta" },
            { visual: <PhoneSplit />, label: "Divide y paga" },
          ]}
          note="Cada uno divide como quiere y elige cómo pagar."
        />
      ),
    },
    {
      id: "local",
      render: () => (
        <Flow
          kicker="Tu local"
          tone="pagos"
          title="Sabés cuánto falta, en vivo."
          steps={[
            {
              visual: (
                <MiniPanel tab="Pagos">
                  <Row tone="pagos" className="text-[0.72rem]">Mesa 12 hizo un pedido</Row>
                  <Row tone="pagos" className="text-[0.72rem]">Mesa 12 pidió la cuenta</Row>
                </MiniPanel>
              ),
              label: "Te avisa la mesa",
            },
            { visual: <BillPanel />, label: "Ves lo pagado y lo que falta" },
            {
              visual: (
                <MiniPanel tab="Pagos">
                  <Row tone="ok" className="justify-between text-[0.68rem]">
                    <span>Juan</span>
                    <span>Transferencia</span>
                  </Row>
                  <Row tone="ok" className="justify-between text-[0.68rem]">
                    <span>María</span>
                    <span>Tarjeta</span>
                  </Row>
                </MiniPanel>
              ),
              label: "Ves quién pagó y cómo",
            },
          ]}
          note="La mesa se cierra cuando está toda paga."
        />
      ),
    },
    {
      id: "beneficio",
      render: () => (
        <Benefits
          kicker="Pagos divididos"
          tone="pagos"
          title="Lo que gana la mesa."
          items={[
            { art: BenefitArt.splitBill, title: "Pagar sin esperar", sub: "La mesa paga cuando quiere, desde el celular." },
            { art: BenefitArt.coins, title: "Sabés si está cubierta", sub: "Total, pagado y pendiente, al toque." },
            { art: BenefitArt.bell, title: "Menos idas y vueltas", sub: "La mesa llama o pide la cuenta desde el celular." },
          ]}
        />
      ),
    },
    { id: "cierre", render: () => <Closing title="Cada uno lo suyo." question="¿Lo vemos en una mesa tuya?" /> },
  ],
};

export const TOURS: Record<TourId, Tour> = {
  completa: COMPLETA,
  pedidos: PEDIDOS,
  celular: CELULAR,
  recepcion: RECEPCION,
  pagos: PAGOS,
};

export const isTourId = (v: string): v is TourId => v in TOURS;
